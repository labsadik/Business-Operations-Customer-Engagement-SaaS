import { Schema, model, models, type InferSchemaType } from "mongoose";
import { createAddressSchema } from "@/models/address-schema";

const platformSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: "default"
    },
    legalName: { type: String, required: true, trim: true, maxlength: 200, default: "AlgoQuit" },
    description: { type: String, trim: true, maxlength: 1200, default: "Canvas by AlgoQuit brings scheduling, team tasks, private files, and client communication into one workspace." },
    websiteUrl: { type: String, trim: true, maxlength: 500, default: "" },
    billingEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    phone: { type: String, trim: true, maxlength: 32, default: "" },
    logoUrl: { type: String, trim: true, maxlength: 2000, default: "" },
    taxId: { type: String, trim: true, maxlength: 80, default: "" },
    gstin: { type: String, trim: true, maxlength: 80, default: "" },
    sacCode: { type: String, trim: true, maxlength: 40, default: "" },
    address: {
      type: createAddressSchema({
        trim: true,
        enforceMaxLength: true,
        defaults: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "India" }
      }),
      default: () => ({})
    },
    gst: {
      enabled: { type: Boolean, default: true },
      ratePercent: { type: Number, min: 0, max: 100, default: 18 },
      inclusive: { type: Boolean, default: false }
    },
    navigation: {
      dashboard: { type: String, trim: true, maxlength: 80, default: "Overview" },
      meetings: { type: String, trim: true, maxlength: 80, default: "Meetings" },
      team: { type: String, trim: true, maxlength: 80, default: "Team" },
      feedback: { type: String, trim: true, maxlength: 80, default: "Feedback" },
      supportTickets: { type: String, trim: true, maxlength: 80, default: "Support tickets" },
      announcements: { type: String, trim: true, maxlength: 80, default: "Announcements" },
      billing: { type: String, trim: true, maxlength: 80, default: "Billing" },
      workspaceSettings: { type: String, trim: true, maxlength: 80, default: "Workspace settings" },
      companyProfile: { type: String, trim: true, maxlength: 80, default: "Company profile" },
      adminCompanies: { type: String, trim: true, maxlength: 80, default: "Companies" },
      adminPublicUsers: { type: String, trim: true, maxlength: 80, default: "Public users" },
      adminPlans: { type: String, trim: true, maxlength: 80, default: "Plans" },
      adminAnnouncements: { type: String, trim: true, maxlength: 80, default: "Announcements" },
      adminFeedback: { type: String, trim: true, maxlength: 80, default: "Feedback" },
      adminSupportTickets: { type: String, trim: true, maxlength: 80, default: "Support tickets" },
      adminAccess: { type: String, trim: true, maxlength: 80, default: "Admin access" },
      adminPlatformSettings: { type: String, trim: true, maxlength: 80, default: "Platform settings" }
    },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export type PlatformSettingsDocument = InferSchemaType<typeof platformSettingsSchema>;
export const PlatformSettings = models.PlatformSettings ?? model("PlatformSettings", platformSettingsSchema);
