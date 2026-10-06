import { Types } from "mongoose";

export function landingPlatformAnnouncementFilter() {
  return {
    status: "PUBLISHED" as const,
    audience: "LANDING_PAGE" as const
  };
}

export function companyPlatformAnnouncementFilter(companyId: string) {
  if (!Types.ObjectId.isValid(companyId)) {
    throw new Error("INVALID_COMPANY_ID");
  }

  return {
    status: "PUBLISHED" as const,
    $or: [
      { audience: "ALL_COMPANIES" as const },
      {
        audience: "SELECTED_COMPANIES" as const,
        targetCompanyIds: new Types.ObjectId(companyId)
      }
    ]
  };
}
