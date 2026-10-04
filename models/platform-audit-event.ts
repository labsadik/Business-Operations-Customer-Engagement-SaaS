import { Schema, model, models } from "mongoose";

const platformAuditEventSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entityType: {
      type: String,
      enum: ["PLATFORM_ANNOUNCEMENT", "FEEDBACK", "SUPPORT_TICKET", "PLAN"],
      required: true,
      index: true
    },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true, index: true },
    details: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

platformAuditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
platformAuditEventSchema.index({ actorUserId: 1, createdAt: -1 });

export const PlatformAuditEvent =
  models.PlatformAuditEvent ?? model("PlatformAuditEvent", platformAuditEventSchema);
