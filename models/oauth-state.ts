import { Schema, model, models } from "mongoose";

const oauthStateSchema = new Schema(
  {
    state: { type: String, required: true, unique: true, index: true },
    intent: { type: String, enum: ["workspace", "customer", "employee", "company", "connect"], required: true },
    companySlug: { type: String, lowercase: true, trim: true },
    invitationToken: { type: String },
    returnTo: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthState = models.OAuthState ?? model("OAuthState", oauthStateSchema);