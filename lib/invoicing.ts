import { PLATFORM_BRAND, platformLegalProfile } from "@/lib/platform";
import type { PlanEntitlements } from "@/lib/plans";

export type InvoiceTaxSnapshot = {
  enabled: boolean;
  ratePercent: number;
  inclusive: boolean;
  taxableAmount: number;
  gstAmount: number;
};

export async function invoiceTaxConfig() {
  const legal = await platformLegalProfile();
  return {
    enabled: legal.gst.enabled,
    inclusive: legal.gst.inclusive,
    ratePercent: legal.gst.ratePercent
  };
}

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
}) {
  const legal = await platformLegalProfile();
  const taxSnapshot = calculateInvoiceTax(
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
    planSnapshot: {
      name: input.plan.name,
      priceInr: input.plan.priceInr,
      maxEmployees: input.plan.maxEmployees,
      monthlyMeetingLimit: input.plan.monthlyMeetingLimit,
      maxMeetingDurationMinutes: input.plan.maxMeetingDurationMinutes,
      maxConcurrentMeetings: input.plan.maxConcurrentMeetings
    },
    serviceDescription: `Conventus ${input.plan.name} monthly scheduling service`
  };
}
