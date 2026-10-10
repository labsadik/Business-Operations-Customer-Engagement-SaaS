import { Schema, model, models } from "mongoose";

const liveChatMonthlyCustomerSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  periodKey: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  visitorKeyHash: { type: String, required: true, maxlength: 64 },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

liveChatMonthlyCustomerSchema.index(
  { companyId: 1, periodKey: 1, visitorKeyHash: 1 },
  { unique: true }
);
liveChatMonthlyCustomerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LiveChatMonthlyCustomer = models.LiveChatMonthlyCustomer ?? model("LiveChatMonthlyCustomer", liveChatMonthlyCustomerSchema);
