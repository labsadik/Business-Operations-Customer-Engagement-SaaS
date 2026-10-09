
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Invoice } from "@/models/invoice";
import { getPlan } from "@/lib/plans";
import { calculateInvoiceTax, type InvoiceTaxSnapshot } from "@/lib/invoicing";
import { platformLegalProfile } from "@/lib/platform";
import { getSafeWebsiteUrl } from "@/lib/public-origin";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.075, 0.09, 0.12);
const MUTED = rgb(0.36, 0.40, 0.46);
const SOFT = rgb(0.95, 0.96, 0.97);
const BLUE = rgb(0.145, 0.388, 0.922);
const PALE_BLUE = rgb(0.94, 0.97, 1);
const GREEN = rgb(0.05, 0.48, 0.32);
const PALE_GREEN = rgb(0.93, 0.98, 0.95);
const WHITE = rgb(1, 1, 1);

function money(minor: number, currency: string) {
  return (currency || "INR").toUpperCase() + " " + (Math.max(0, minor) / 100).toFixed(2);
}

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function splitLongToken(token: string, font: PDFFont, size: number, maxWidth: number) {
  const parts: string[] = [];
  let current = "";

  for (const char of token) {
    const candidate = current + char;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return ["-"];

  const lines: string[] = [];
  let current = "";

  for (const token of normalized.split(" ")) {
    if (font.widthOfTextAtSize(token, size) > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }

      const chunks = splitLongToken(token, font, size, maxWidth);
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] || "";
      continue;
    }

    const candidate = current ? current + " " + token : token;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK
) {
  page.drawText(text || "-", { x, y, font, size, color });
}

function drawRight(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK
) {
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, rightX - width, y, font, size, color);
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineGap = 2,
  color = MUTED
) {
  const lines = wrapText(text, font, size, maxWidth);
  const lineHeight = size + lineGap;

  lines.forEach((line, index) => {
    drawText(page, line, x, y - index * lineHeight, font, size, color);
  });

  return lines.length * lineHeight;
}

function drawRule(page: PDFPage, y: number, color = SOFT) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.8,
    color
  });
}

function drawStatusBadge(
  page: PDFPage,
  source: "PAID" | "FREE" | "ADMIN_GRANTED",
  x: number,
  y: number,
  bold: PDFFont
) {
  const label =
    source === "PAID"
      ? "PAID / CAPTURED"
      : source === "ADMIN_GRANTED"
        ? "ADMIN GRANTED"
        : "FREE ACCESS";
  const color = source === "PAID" ? GREEN : source === "ADMIN_GRANTED" ? BLUE : MUTED;
  const width = bold.widthOfTextAtSize(label, 7.3) + 18;

  page.drawRectangle({
    x,
    y,
    width,
    height: 17,
    color
  });
  drawText(page, label, x + 9, y + 5.3, bold, 7.3, WHITE);
  return width;
}

function drawConventusMark(page: PDFPage, x: number, y: number, size: number) {
  page.drawRectangle({ x, y, width: size, height: size, color: INK });
  page.drawCircle({
    x: x + size * 0.66,
    y: y + size * 0.5,
    size: size * 0.055,
    color: BLUE
  });
  page.drawCircle({
    x: x + size * 0.5,
    y: y + size * 0.5,
    size: size * 0.29,
    color: WHITE
  });
  page.drawCircle({
    x: x + size * 0.58,
    y: y + size * 0.5,
    size: size * 0.19,
    color: INK
  });
}

function partyDetails(
  page: PDFPage,
  title: string,
  name: string,
  details: string[],
  x: number,
  topY: number,
  width: number,
  regular: PDFFont,
  bold: PDFFont
) {
  const lines = details.filter(Boolean);
  const boxTop = topY;
  const boxBottom = topY - 112;

  page.drawRectangle({
    x,
    y: boxBottom,
    width,
    height: boxTop - boxBottom,
    color: WHITE,
    borderColor: SOFT,
    borderWidth: 0.9
  });

  drawText(page, title.toUpperCase(), x + 14, boxTop - 17, bold, 7, MUTED);
  const nameLines = wrapText(name || "-", bold, 10, width - 28);
  nameLines.forEach((line, index) => {
    drawText(page, line, x + 14, boxTop - 35 - index * 12, bold, 10, INK);
  });

  let y = boxTop - 35 - nameLines.length * 11.5 - 4;
  for (const value of lines) {
    const wrapped = wrapText(value, regular, 7.5, width - 28);
    wrapped.forEach((line, index) => {
      drawText(page, line, x + 14, y - index * 7.8, regular, 6.9, MUTED);
    });
    y -= wrapped.length * 7.8 + 1;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (
      !session.companyId ||
      !["COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)
    ) {
      return jsonError("FORBIDDEN", 403);
    }

    const { invoiceId } = await params;
    if (!Types.ObjectId.isValid(invoiceId)) {
      return jsonError("INVALID_INVOICE_ID", 400);
    }

    await getMongo();

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      companyId: session.companyId
    }).lean();

    if (!invoice) return jsonError("INVOICE_NOT_FOUND", 404);

    const legacyMerchant = await platformLegalProfile();
    const legacyTax = calculateInvoiceTax(
      invoice.amount,
      legacyMerchant.gst.ratePercent,
      legacyMerchant.gst.inclusive,
      legacyMerchant.gst.enabled
    );

    const tax: InvoiceTaxSnapshot = invoice.taxSnapshot
      ? {
          enabled: invoice.taxSnapshot.enabled,
          ratePercent: invoice.taxSnapshot.ratePercent,
          inclusive: invoice.taxSnapshot.inclusive,
          taxableAmount: invoice.taxSnapshot.taxableAmount,
          gstAmount: invoice.taxSnapshot.gstAmount
        }
      : legacyTax;

    const merchant = {
      name: invoice.merchantSnapshot?.name || legacyMerchant.legalName,
      description: invoice.merchantSnapshot?.description || legacyMerchant.description,
      websiteUrl: invoice.merchantSnapshot
        ? getSafeWebsiteUrl(invoice.merchantSnapshot.websiteUrl)
        : legacyMerchant.websiteUrl,
      email: invoice.merchantSnapshot?.email || legacyMerchant.email,
      phone: invoice.merchantSnapshot?.phone || legacyMerchant.phone,
      taxId: invoice.merchantSnapshot?.taxId || legacyMerchant.taxId,
      gstin: invoice.merchantSnapshot?.gstin || legacyMerchant.gstin,
      sacCode: invoice.merchantSnapshot?.sacCode || legacyMerchant.sacCode,
      address: invoice.merchantSnapshot?.address || legacyMerchant.address
    };

    const plan = getPlan(invoice.planId);
    const planSnapshot = invoice.planSnapshot || (plan
      ? {
          name: plan.name,
          priceInr: plan.priceInr,
          maxEmployees: plan.maxEmployees,
          monthlyMeetingLimit: plan.monthlyMeetingLimit,
          maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
          maxConcurrentMeetings: plan.maxConcurrentMeetings
        }
      : null);

    if (!planSnapshot) return jsonError("PLAN_NOT_FOUND", 409);

    const company = {
      name: invoice.companySnapshot.name,
      email: invoice.companySnapshot.email,
      phone: invoice.companySnapshot.phone,
      taxId: invoice.companySnapshot.taxId || "",
      address: invoice.companySnapshot.address || {}
    };

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(invoice.invoiceNumber + " - " + merchant.name);
    pdfDoc.setAuthor(merchant.name);
    pdfDoc.setSubject("Conventus invoice");
    pdfDoc.setCreator("Conventus billing");

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 7,
      width: PAGE_WIDTH,
      height: 7,
      color: BLUE
    });

    drawConventusMark(page, MARGIN, 767, 38);
    drawText(page, merchant.name, 94, 786, bold, 15, INK);
    drawWrapped(
      page,
      merchant.description,
      94,
      771,
      238,
      regular,
      8.1,
      2,
      MUTED
    );

    drawText(
      page,
      tax.enabled ? "TAX INVOICE" : "INVOICE",
      PAGE_WIDTH - MARGIN - 168,
      786,
      bold,
      8,
      BLUE
    );
    drawRight(page, invoice.invoiceNumber, PAGE_WIDTH - MARGIN, 767, bold, 12.5, INK);
    drawRight(page, "Issued " + dateLabel(invoice.issuedAt), PAGE_WIDTH - MARGIN, 752, regular, 8, MUTED);

    const badgeText =
      invoice.source === "PAID"
        ? "PAID / CAPTURED"
        : invoice.source === "ADMIN_GRANTED"
          ? "ADMIN GRANTED"
          : "FREE ACCESS";
    const badgeWidth = bold.widthOfTextAtSize(badgeText, 7.3) + 18;
    drawStatusBadge(
      page,
      invoice.source,
      PAGE_WIDTH - MARGIN - badgeWidth,
      728,
      bold
    );

    drawRule(page, 711);

    const partyTop = 698;
    const partyGap = 14;
    const partyWidth = (CONTENT_WIDTH - partyGap) / 2;

    const merchantDetails = [
      merchant.address.line1,
      merchant.address.line2,
      [merchant.address.city, merchant.address.state, merchant.address.postalCode].filter(Boolean).join(", "),
      merchant.address.country,
      merchant.email,
      merchant.phone,
      merchant.gstin ? "GSTIN: " + merchant.gstin : "",
      merchant.taxId && merchant.taxId !== merchant.gstin ? "Tax ID: " + merchant.taxId : "",
      merchant.sacCode ? "SAC: " + merchant.sacCode : ""
    ];

    const companyDetails = [
      company.address.line1,
      company.address.line2,
      [company.address.city, company.address.state, company.address.postalCode].filter(Boolean).join(", "),
      company.address.country,
      company.email,
      company.phone,
      company.taxId ? "Tax ID / GSTIN: " + company.taxId : ""
    ];

    partyDetails(
      page,
      "Merchant",
      merchant.name,
      merchantDetails,
      MARGIN,
      partyTop,
      partyWidth,
      regular,
      bold
    );

    partyDetails(
      page,
      "Bill to",
      company.name,
      companyDetails,
      MARGIN + partyWidth + partyGap,
      partyTop,
      partyWidth,
      regular,
      bold
    );

    const subscriptionTop = 572;
    page.drawRectangle({
      x: MARGIN,
      y: subscriptionTop - 60,
      width: CONTENT_WIDTH,
      height: 60,
      color: PALE_BLUE
    });

    drawText(page, "SUBSCRIPTION", MARGIN + 14, subscriptionTop - 17, bold, 7, BLUE);
    drawWrapped(
      page,
      planSnapshot.name,
      MARGIN + 14,
      subscriptionTop - 34,
      245,
      bold,
      12,
      2,
      INK
    );

    const serviceText =
      invoice.serviceDescription ||
      "Conventus " + planSnapshot.name + " monthly scheduling service";
    drawWrapped(
      page,
      serviceText,
      MARGIN + 14,
      subscriptionTop - 49,
      280,
      regular,
      7.7,
      2,
      MUTED
    );

    drawText(page, "SERVICE PERIOD", 375, subscriptionTop - 17, bold, 7, MUTED);
    const periodText = invoice.billingPeriodStart
      ? dateLabel(invoice.billingPeriodStart) +
        (invoice.billingPeriodEnd ? " - " + dateLabel(invoice.billingPeriodEnd) : "")
      : "One access period";
    drawWrapped(page, periodText, 375, subscriptionTop - 34, 164, bold, 8.4, 2, INK);

    const tableTop = 495;
    page.drawRectangle({
      x: MARGIN,
      y: tableTop - 26,
      width: CONTENT_WIDTH,
      height: 26,
      color: SOFT
    });
    drawText(page, "LINE ITEM", MARGIN + 14, tableTop - 16, bold, 7, MUTED);
    drawRight(page, "TAXABLE VALUE", PAGE_WIDTH - MARGIN - 14, tableTop - 16, bold, 7, MUTED);

    const rowBottom = tableTop - 74;
    page.drawRectangle({
      x: MARGIN,
      y: rowBottom,
      width: CONTENT_WIDTH,
      height: 48,
      color: WHITE,
      borderColor: SOFT,
      borderWidth: 0.9
    });

    drawWrapped(
      page,
      serviceText,
      MARGIN + 14,
      tableTop - 42,
      320,
      bold,
      8.7,
      2,
      INK
    );
    drawText(page, planSnapshot.name + " subscription service", MARGIN + 14, tableTop - 61, regular, 7.4, MUTED);
    drawRight(
      page,
      money(tax.taxableAmount, invoice.currency),
      PAGE_WIDTH - MARGIN - 14,
      tableTop - 45,
      bold,
      9,
      INK
    );

    drawRule(page, rowBottom - 14);

    const summaryY = 398;
    const leftX = MARGIN;
    const leftW = 278;
    const rightX = 342;
    const rightW = PAGE_WIDTH - MARGIN - rightX;

    drawText(page, "PAYMENT & ACCESS", leftX, summaryY, bold, 7, BLUE);

    drawText(page, "STATUS", leftX, summaryY - 18, bold, 7, MUTED);
    drawText(
      page,
      invoice.source === "PAID"
        ? "PAID / CAPTURED"
        : invoice.source === "ADMIN_GRANTED"
          ? "ADMIN GRANTED"
          : "FREE ACCESS",
      leftX,
      summaryY - 31,
      bold,
      8.7,
      INK
    );

    drawText(
      page,
      invoice.source === "PAID" ? "PAYMENT REFERENCE" : "ACCESS BASIS",
      leftX,
      summaryY - 49,
      bold,
      7,
      MUTED
    );
    drawWrapped(
      page,
      invoice.source === "PAID"
        ? invoice.providerPaymentId || "-"
        : invoice.source === "ADMIN_GRANTED"
          ? "Granted by platform administrator"
          : "No customer payment required",
      leftX,
      summaryY - 62,
      leftW,
      regular,
      7.8,
      2,
      INK
    );

    drawText(page, "CURRENCY", leftX + 188, summaryY - 18, bold, 7, MUTED);
    drawText(page, invoice.currency.toUpperCase(), leftX + 188, summaryY - 31, bold, 8.7, INK);

    const taxable = money(tax.taxableAmount, invoice.currency);
    const gstText = tax.enabled
      ? "GST @ " + tax.ratePercent.toFixed(2) + "%" + (tax.inclusive ? " (included)" : "")
      : "GST not applicable";

    drawText(page, "TAXABLE VALUE", rightX, summaryY, bold, 7, MUTED);
    drawRight(page, taxable, PAGE_WIDTH - MARGIN, summaryY, regular, 8.5, INK);
    drawText(page, gstText, rightX, summaryY - 18, bold, 7.2, MUTED);
    drawRight(page, money(tax.gstAmount, invoice.currency), PAGE_WIDTH - MARGIN, summaryY - 18, regular, 8.5, INK);

    page.drawRectangle({
      x: rightX - 10,
      y: summaryY - 74,
      width: rightW + 10,
      height: 50,
      color: INK
    });

    drawText(
      page,
      invoice.source === "PAID" ? "TOTAL PAID" : "INVOICE TOTAL",
      rightX + 4,
      summaryY - 51,
      bold,
      7,
      rgb(0.68, 0.71, 0.76)
    );
    drawRight(
      page,
      money(invoice.amount, invoice.currency),
      PAGE_WIDTH - MARGIN - 4,
      summaryY - 51,
      bold,
      14,
      WHITE
    );

    const entitlementsTop = 292;
    drawText(page, "PLAN ENTITLEMENTS", MARGIN, entitlementsTop, bold, 7, BLUE);
    drawText(page, "Snapshot recorded on this invoice", MARGIN, entitlementsTop - 13, regular, 7.3, MUTED);

    const entitlementItems = [
      "Plan: " + planSnapshot.name,
      "Plan list price: " + money(Math.round(planSnapshot.priceInr * 100), invoice.currency),
      planSnapshot.maxEmployees + " employees",
      planSnapshot.monthlyMeetingLimit + " meetings / month",
      planSnapshot.maxMeetingDurationMinutes + " min max duration",
      planSnapshot.maxConcurrentMeetings + " concurrent meetings",
      (planSnapshot.validityDays ?? 30) + " days validity",
      ...(planSnapshot.freeFeatureDays
        ? [planSnapshot.freeFeatureDays + " active feature days"]
        : [])
    ];

    entitlementItems.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = MARGIN + col * 258;
      const y = entitlementsTop - 31 - row * 17;

      page.drawRectangle({
        x,
        y: y - 3,
        width: 5,
        height: 5,
        color: BLUE
      });
      drawWrapped(page, item, x + 11, y, 236, regular, 7.7, 1.5, MUTED);
    });

    const footerY = 59;
    drawRule(page, footerY + 31);
    drawText(
      page,
      "Generated electronically by " + merchant.name + ".",
      MARGIN,
      footerY + 14,
      regular,
      7.2,
      MUTED
    );
    if (merchant.websiteUrl) {
      drawRight(page, merchant.websiteUrl, PAGE_WIDTH - MARGIN, footerY + 14, regular, 7.2, MUTED);
    }
    drawText(
      page,
      "This document is an electronic invoice; no physical signature is required.",
      MARGIN,
      footerY,
      regular,
      7.1,
      MUTED
    );
    drawRight(
      page,
      tax.inclusive ? "Displayed amounts include GST where applicable." : "GST is shown separately where applicable.",
      PAGE_WIDTH - MARGIN,
      footerY,
      regular,
      6.9,
      MUTED
    );

    const bytes = await pdfDoc.save();

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=\"" + invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".pdf\"",
        "cache-control": "private, no-store, max-age=0"
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVOICE_PDF_FAILED";
    return jsonError(code, 500);
  }
}
