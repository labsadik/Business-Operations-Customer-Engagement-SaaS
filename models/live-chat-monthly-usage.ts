import { Schema, model, models } from "mongoose";

const liveChatMonthlyUsageSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  periodKey: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  chatCount: { type: Number, required: true, default: 0, min: 0 },
  customerCount: { type: Number, required: true, default: 0, min: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

liveChatMonthlyUsageSchema.index({ companyId: 1, periodKey: 1 }, { unique: true });
liveChatMonthlyUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LiveChatMonthlyUsage = models.LiveChatMonthlyUsage ?? model("LiveChatMonthlyUsage", liveChatMonthlyUsageSchema);
