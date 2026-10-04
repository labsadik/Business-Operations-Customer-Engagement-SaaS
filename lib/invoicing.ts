import { PLATFORM_BRAND, platformLegalProfile } from "@/lib/platform";
import type { PlanEntitlements } from "@/lib/plans";

export type InvoiceTaxSnapshot = {
  enabled: boolean;
  ratePercent: number;
  inclusive: boolean;
  taxableAmount: number;
  gstAmount: number;
};

export type InvoiceTaxCalculation = InvoiceTaxSnapshot & {
  totalAmount: number;
};

export async function invoiceTaxConfig() {
  const legal = await platformLegalProfile();
  return {
    enabled: legal.gst.enabled,
    inclusive: legal.gst.inclusive,
    ratePercent: legal.gst.ratePercent
  };
}

/**
 * Legacy invoice calculation where totalMinor already represents the
 * customer-paid total. Kept for old invoices/backfill compatibility.
 */
export function calculateInvoiceTax(
  totalMinor: number,
  ratePercent = 18,
  inclusive = true,
  enabled = true
): InvoiceTaxSnapshot {
  const safeTotal = Math.max(0, Math.round(totalMinor));
  if (!enabled || ratePercent <= 0) {
    return {
      enabled: false,
      ratePercent: 0,
      inclusive,
      taxableAmount: safeTotal,
      gstAmount: 0
    };
  }

  if (inclusive) {
    const taxableAmount = Math.round(safeTotal / (1 + ratePercent / 100));
    return {
      enabled: true,
      ratePercent,
      inclusive: true,
      taxableAmount,
      gstAmount: safeTotal - taxableAmount
    };
  }

  const gstAmount = Math.round(safeTotal * ratePercent / 100);
  return {
    enabled: true,
    ratePercent,
    inclusive: false,
    taxableAmount: safeTotal,
    gstAmount
  };
}

/**
 * Checkout calculation where the configured plan price is the base amount
 * and GST is added on top when pricing is exclusive.
 */
export function calculateInvoiceTaxFromBase(
  baseMinor: number,
  ratePercent = 18,
  inclusive = false,
  enabled = true
): InvoiceTaxCalculation {
  const safeBase = Math.max(0, Math.round(baseMinor));

  if (!enabled || ratePercent <= 0) {
    return {
      enabled: false,
      ratePercent: 0,
      inclusive,
      taxableAmount: safeBase,
      gstAmount: 0,
      totalAmount: safeBase
    };
  }

  if (inclusive) {
    const taxableAmount = Math.round(safeBase / (1 + ratePercent / 100));
    const gstAmount = safeBase - taxableAmount;
    return {
      enabled: true,
      ratePercent,
      inclusive: true,
      taxableAmount,
      gstAmount,
      totalAmount: safeBase
    };
  }

  const gstAmount = Math.round(safeBase * ratePercent / 100);
  return {
    enabled: true,
    ratePercent,
    inclusive: false,
    taxableAmount: safeBase,
    gstAmount,
    totalAmount: safeBase + gstAmount
  };
}

export async function buildInvoiceSnapshots(input: {
  company: {
    name: string;
    email?: string;
    phone?: string;
    logoUrl?: string;
    websiteUrl?: string;
    description?: string;
    taxId?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  plan: PlanEntitlements;
  amount: number;
  taxSnapshot?: InvoiceTaxSnapshot;
  discount?: {
    type: "NONE" | "PERCENTAGE" | "FIXED_AMOUNT";
    value: number;
    amountMinor: number;
  };
}) {
  const legal = await platformLegalProfile();
  const taxSnapshot = input.taxSnapshot ?? calculateInvoiceTax(
    input.amount,
    legal.gst.ratePercent,
    legal.gst.inclusive,
    legal.gst.enabled
  );

  return {
    merchantSnapshot: {
      name: legal.legalName || PLATFORM_BRAND.name,
      description: legal.description || PLATFORM_BRAND.description,
      logoUrl: legal.logoUrl,
      websiteUrl: legal.websiteUrl,
      email: legal.email,
      phone: legal.phone,
      taxId: legal.taxId,
      gstin: legal.gstin,
      sacCode: legal.sacCode,
      address: legal.address
    },
    companySnapshot: {
      name: input.company.name,
      email: input.company.email?.trim().toLowerCase() ?? "",
      phone: input.company.phone?.trim() ?? "",
      address: {
        line1: input.company.address?.line1 ?? "",
        line2: input.company.address?.line2 ?? "",
        city: input.company.address?.city ?? "",
        state: input.company.address?.state ?? "",
        postalCode: input.company.address?.postalCode ?? "",
        country: input.company.address?.country ?? ""
      },
      taxId: input.company.taxId ?? ""
    },
    taxSnapshot,
    discountType: input.discount?.type ?? "NONE",
    discountValue: input.discount?.value ?? 0,
    discountAmount: input.discount?.amountMinor ?? 0,
    planSnapshot: {
      id: input.plan.id,
      name: input.plan.name,
      priceInr: input.plan.priceInr,
      maxWorkspaces: input.plan.maxWorkspaces,
      maxCompanies: input.plan.maxCompanies,
      maxEmployees: input.plan.maxEmployees,
      monthlyMeetingLimit: input.plan.monthlyMeetingLimit,
      maxMeetingDurationMinutes: input.plan.maxMeetingDurationMinutes,
      maxConcurrentMeetings: input.plan.maxConcurrentMeetings,
      validityDays: input.plan.validityDays,
      freeFeatureDays: input.plan.freeFeatureDays,
      requiresPayment: input.plan.requiresPayment
    },
    serviceDescription: input.plan.id === "free"
      ? "Conventus Free plan access"
      : `Conventus ${input.plan.name} monthly scheduling service`
  };
}
