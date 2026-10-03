import { Schema, model, models } from "mongoose";

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true },
    expiresAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date }
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = models.Session ?? model("Session", sessionSchema);