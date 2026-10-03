import { Schema, model, models } from "mongoose";

const googleAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    googleSubject: { type: String, required: true, index: true },
    googleEmail: { type: String, required: true, lowercase: true, trim: true },
    encryptedRefreshToken: { type: String, required: true },
    accessTokenExpiresAt: { type: Date },
    scopes: [{ type: String }],
    status: {
      type: String,
      enum: ["CONNECTED", "REAUTH_REQUIRED", "DISCONNECTED"],
      default: "CONNECTED",
      index: true
    },
    lastSuccessfulSyncAt: { type: Date },
    lastErrorAt: { type: Date },
    lastErrorCode: { type: String }
  },
  { timestamps: true }
);

export const GoogleAccount = models.GoogleAccount ?? model("GoogleAccount", googleAccountSchema);