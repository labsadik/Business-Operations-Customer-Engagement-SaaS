import { Schema, model, models } from "mongoose";

const adminAuditEventSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: {
      type: String,
      enum: ["GRANT_PLATFORM_ADMIN", "REVOKE_PLATFORM_ADMIN"],
      required: true,
      index: true
    },
    fromRole: { type: String, required: true },
    toRole: { type: String, required: true }
  },
  { timestamps: true }
);

adminAuditEventSchema.index({ targetUserId: 1, createdAt: -1 });
adminAuditEventSchema.index({ actorUserId: 1, createdAt: -1 });

export const AdminAuditEvent =
  models.AdminAuditEvent ?? model("AdminAuditEvent", adminAuditEventSchema);
