import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Invoice } from "@/models/invoice";
import { getPlan } from "@/lib/plans";
import { calculateInvoiceTax, type InvoiceTaxSnapshot } from "@/lib/invoicing";
import { platformLegalProfile } from "@/lib/platform";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const INK = rgb(0.058, 0.09, 0.164);
const MUTED = rgb(0.35, 0.39, 0.46);
const LIGHT = rgb(0.94, 0.95, 0.97);
const BLUE = rgb(0.145, 0.388, 0.922);
const GREEN = rgb(0.047, 0.48, 0.32);
const WHITE = rgb(1, 1, 1);

function money(minor: number, currency: string) {
  return `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`;
}

function dateLabel(value: Date | string | null | undefined, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }
  ).format(new Date(value));
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(text || "—", { x, y, font, size, color });
}

function drawRight(page: PDFPage, text: string, rightX: number, y: number, font: PDFFont, size: number, color = INK) {
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, rightX - width, y, font, size, color);
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, lineGap = 3, color = MUTED) {
  const lineHeight = size + lineGap;
  for (const [index, line] of wrapText(text, font, size, maxWidth).entries()) {
    drawText(page, line, x, y - index * lineHeight, font, size, color);
  }
}

function drawRule(page: PDFPage, y: number, x = 42, width = PAGE_WIDTH - 84) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.8,
    color: LIGHT
  });
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  bold: PDFFont
) {
  drawText(page, label.toUpperCase(), x, y, bold, 7, MUTED);
  const lines = wrapText(value || "—", font, 9, width);
  lines.slice(0, 2).forEach((line, index) => {
    drawText(page, line, x, y - 13 - index * 11, font, 9, INK);
  });
}

function drawConventusMark(page: PDFPage, x: number, y: number, size: number) {
  page.drawRectangle({ x, y, width: size, height: size, color: INK });
  page.drawCircle({ x: x + size * 0.66, y: y + size * 0.5, size: size * 0.055, color: BLUE });
  page.drawCircle({ x: x + size * 0.5, y: y + size * 0.5, size: size * 0.29, color: WHITE });
  page.drawCircle({ x: x + size * 0.58, y: y + size * 0.5, size: size * 0.19, color: INK });

}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    const { invoiceId } = await params;
    if (!Types.ObjectId.isValid(invoiceId)) return jsonError("INVALID_INVOICE_ID", 400);

    await getMongo();
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      companyId: session.companyId
    }).lean();
    if (!invoice) return jsonError("INVOICE_NOT_FOUND", 404);

    const legacyMerchant = await platformLegalProfile();
    const legacyTax = calculateInvoiceTax(invoice.amount, legacyMerchant.gst.ratePercent, legacyMerchant.gst.inclusive, legacyMerchant.gst.enabled);
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
      logoUrl: invoice.merchantSnapshot?.logoUrl || legacyMerchant.logoUrl,
      websiteUrl: invoice.merchantSnapshot?.websiteUrl || legacyMerchant.websiteUrl,
      email: invoice.merchantSnapshot?.email || legacyMerchant.email,
      phone: invoice.merchantSnapshot?.phone || legacyMerchant.phone,
      taxId: invoice.merchantSnapshot?.taxId || legacyMerchant.taxId,
      gstin: invoice.merchantSnapshot?.gstin || legacyMerchant.gstin,
      sacCode: invoice.merchantSnapshot?.sacCode || legacyMerchant.sacCode,
      address: invoice.merchantSnapshot?.address || legacyMerchant.address
    };

    const plan = getPlan(invoice.planId);
    const planSnapshot = invoice.planSnapshot || (plan ? {
      name: plan.name,
      priceInr: plan.priceInr,
      maxEmployees: plan.maxEmployees,
      monthlyMeetingLimit: plan.monthlyMeetingLimit,
      maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
      maxConcurrentMeetings: plan.maxConcurrentMeetings
    } : null);

    if (!planSnapshot) return jsonError("PLAN_NOT_FOUND", 409);

    const company = {
      name: invoice.companySnapshot.name,
      email: invoice.companySnapshot.email,
      phone: invoice.companySnapshot.phone,
      taxId: invoice.companySnapshot.taxId || "",
      address: invoice.companySnapshot.address || {}
    };

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`${invoice.invoiceNumber} — ${merchant.name}`);
    pdfDoc.setAuthor(merchant.name);
    pdfDoc.setSubject("Conventus tax invoice");
    pdfDoc.setCreator("Conventus billing");

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: BLUE });
    drawConventusMark(page, 42, PAGE_HEIGHT - 68, 42);
    drawText(page, merchant.name, 94, PAGE_HEIGHT - 43, bold, 15);
    drawWrapped(page, merchant.description, 94, PAGE_HEIGHT - 58, 230, regular, 8.5, 2, MUTED);

    const accessLabel = invoice.source === "PAID" ? "PAID" : invoice.source === "ADMIN_GRANTED" ? "ADMIN GRANTED" : "FREE";
    const accessColor = invoice.source === "PAID" ? GREEN : invoice.source === "ADMIN_GRANTED" ? BLUE : MUTED;
    const badgeWidth = bold.widthOfTextAtSize(accessLabel, 7) + 18;
    page.drawRectangle({
      x: PAGE_WIDTH - 42 - badgeWidth,
      y: PAGE_HEIGHT - 79,
      width: badgeWidth,
      height: 16,
      color: accessColor
    });
    drawText(page, accessLabel, PAGE_WIDTH - 33 - badgeWidth / 2, PAGE_HEIGHT - 74, bold, 7, WHITE);
    drawRight(page, tax.enabled ? "TAX INVOICE" : "INVOICE", PAGE_WIDTH - 42, PAGE_HEIGHT - 38, bold, 8, BLUE);
    drawRight(page, invoice.invoiceNumber, PAGE_WIDTH - 42, PAGE_HEIGHT - 54, bold, 14, INK);
    drawRight(page, `Issued ${dateLabel(invoice.issuedAt)}`, PAGE_WIDTH - 42, PAGE_HEIGHT - 68, regular, 8.5, MUTED);

    drawRule(page, PAGE_HEIGHT - 88);

    const fromY = PAGE_HEIGHT - 116;
    drawLabelValue(page, "Merchant", merchant.name, 42, fromY, 210, regular, bold);
    drawLabelValue(page, "Bill to", company.name, 300, fromY, 210, regular, bold);

    const merchantDetails = [
      ...[merchant.address.line1, merchant.address.line2, merchant.address.city, merchant.address.state, merchant.address.postalCode, merchant.address.country].filter(Boolean),
      merchant.email,
      merchant.phone,
      merchant.websiteUrl,
      merchant.gstin ? `GSTIN: ${merchant.gstin}` : "",
      merchant.taxId && merchant.taxId !== merchant.gstin ? `Tax ID: ${merchant.taxId}` : "",
      merchant.sacCode ? `SAC: ${merchant.sacCode}` : ""
    ].filter(Boolean);

    let yLeft = fromY - 39;
    merchantDetails.slice(0, 7).forEach((line) => {
      const lines = wrapText(line, regular, 8, 218);
      lines.slice(0, 2).forEach((part, index) => drawText(page, part, 42, yLeft - index * 10, regular, 8, MUTED));
      yLeft -= lines.length * 10 + 1;
    });

    const companyDetails = [
      ...[company.address.line1, company.address.line2, company.address.city, company.address.state, company.address.postalCode, company.address.country].filter(Boolean),
      company.email,
      company.phone,
      company.taxId ? `Tax ID / GSTIN: ${company.taxId}` : ""
    ].filter(Boolean);

    let yRight = fromY - 39;
    companyDetails.slice(0, 7).forEach((line) => {
      const lines = wrapText(line, regular, 8, 218);
      lines.slice(0, 2).forEach((part, index) => drawText(page, part, 300, yRight - index * 10, regular, 8, MUTED));
      yRight -= lines.length * 10 + 1;
    });

    const sectionY = Math.min(yLeft, yRight) - 18;
    page.drawRectangle({ x: 42, y: sectionY - 62, width: PAGE_WIDTH - 84, height: 62, color: rgb(0.965, 0.978, 1) });
    drawText(page, "SUBSCRIPTION", 56, sectionY - 19, bold, 7, BLUE);
    drawText(page, planSnapshot.name, 56, sectionY - 38, bold, 13, INK);
    drawText(page, invoice.serviceDescription || `Conventus ${planSnapshot.name} monthly scheduling service`, 56, sectionY - 52, regular, 8, MUTED);

    drawRight(page, "SERVICE PERIOD", PAGE_WIDTH - 58, sectionY - 20, bold, 7, MUTED);
    drawRight(page, invoice.billingPeriodStart ? dateLabel(invoice.billingPeriodStart) : "One month", PAGE_WIDTH - 58, sectionY - 38, bold, 9, INK);
    drawRight(page, invoice.billingPeriodEnd ? `to ${dateLabel(invoice.billingPeriodEnd)}` : "", PAGE_WIDTH - 58, sectionY - 51, regular, 8, MUTED);

    const tableTop = sectionY - 86;
    page.drawRectangle({ x: 42, y: tableTop - 27, width: PAGE_WIDTH - 84, height: 27, color: LIGHT });
    drawText(page, "DESCRIPTION", 56, tableTop - 17, bold, 7, MUTED);
    drawRight(page, "AMOUNT", PAGE_WIDTH - 56, tableTop - 17, bold, 7, MUTED);

    drawText(page, invoice.serviceDescription || `Conventus ${planSnapshot.name} monthly scheduling service`, 56, tableTop - 48, bold, 9, INK);
    drawText(page, "One-month subscription", 56, tableTop - 62, regular, 8, MUTED);
    drawRight(page, money(tax.taxableAmount, invoice.currency), PAGE_WIDTH - 56, tableTop - 48, regular, 9, INK);

    drawRule(page, tableTop - 78, 56, PAGE_WIDTH - 112);

    const summaryTop = tableTop - 105;
    const summaryX = 325;
    drawText(page, "Taxable value", summaryX, summaryTop, regular, 8.5, MUTED);
    drawRight(page, money(tax.taxableAmount, invoice.currency), PAGE_WIDTH - 56, summaryTop, regular, 8.5, INK);

    drawText(
      page,
      tax.enabled ? `GST @ ${tax.ratePercent.toFixed(2)}% ${tax.inclusive ? "(included)" : ""}`.trim() : "GST",
      summaryX,
      summaryTop - 19,
      regular,
      8.5,
      MUTED
    );
    drawRight(page, money(tax.gstAmount, invoice.currency), PAGE_WIDTH - 56, summaryTop - 19, regular, 8.5, INK);

    page.drawRectangle({ x: summaryX - 12, y: summaryTop - 68, width: PAGE_WIDTH - summaryX - 30, height: 52, color: INK });
    drawText(page, "TOTAL PAID", summaryX + 2, summaryTop - 37, bold, 7, rgb(0.7, 0.73, 0.78));
    drawRight(page, money(invoice.amount, invoice.currency), PAGE_WIDTH - 56, summaryTop - 38, bold, 15, WHITE);

    const paymentY = summaryTop - 103;
    drawText(page, "PAYMENT DETAILS", 42, paymentY, bold, 7, BLUE);
    drawLabelValue(page, "Status", invoice.source === "PAID" ? "PAID / CAPTURED" : invoice.source === "ADMIN_GRANTED" ? "ADMIN GRANTED" : "FREE ACCESS", 42, paymentY - 13, 150, regular, bold);
    drawLabelValue(
      page,
      invoice.source === "PAID" ? "Payment ID" : "Access",
      invoice.source === "PAID" ? invoice.providerPaymentId : invoice.source === "ADMIN_GRANTED" ? "Granted by platform admin" : "Free plan",
      205,
      paymentY - 13,
      175,
      regular,
      bold
    );
    drawLabelValue(page, "Currency", invoice.currency, 395, paymentY - 13, 120, regular, bold);

    drawText(page, "PLAN ENTITLEMENTS", 42, paymentY - 65, bold, 7, BLUE);
    const entitlements = [
      `${planSnapshot.maxEmployees} employees`,
      `${planSnapshot.monthlyMeetingLimit} meetings / month`,
      `${planSnapshot.maxMeetingDurationMinutes} min max duration`,
      `${planSnapshot.maxConcurrentMeetings} concurrent meetings`,
      `${planSnapshot.validityDays ?? 30} days validity`,
      ...(planSnapshot.freeFeatureDays ? [`${planSnapshot.freeFeatureDays} active feature days`] : [])
    ];
    entitlements.forEach((item, index) => {
      const x = 42 + (index % 2) * 255;
      const y = paymentY - 83 - Math.floor(index / 2) * 16;
      drawText(page, "•", x, y, bold, 8, BLUE);
      drawText(page, item, x + 10, y, regular, 8, MUTED);
    });

    const footerY = 63;
    drawRule(page, footerY + 26);
    drawText(page, `Generated electronically by ${merchant.name}.`, 42, footerY + 9, regular, 7.5, MUTED);
    if (merchant.websiteUrl) drawRight(page, merchant.websiteUrl, PAGE_WIDTH - 42, footerY + 9, regular, 7.5, MUTED);
    drawText(page, "Displayed subscription price is GST inclusive when indicated above.", 42, footerY - 5, regular, 7.2, MUTED);
    drawRight(page, "No signature required", PAGE_WIDTH - 42, footerY - 5, regular, 7.2, MUTED);

    const bytes = await pdfDoc.save();
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "cache-control": "private, no-store, max-age=0"
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVOICE_PDF_FAILED";
    return jsonError(code, 500);
  }
}
