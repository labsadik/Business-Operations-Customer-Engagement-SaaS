import { Schema, model, models } from "mongoose";

const liveChatConversationSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  visitorKeyHash: { type: String, required: true, maxlength: 64 },
  ipHash: { type: String, required: true, maxlength: 64, index: true },
  originHost: { type: String, default: "", maxlength: 255 },
  customerName: { type: String, default: "", trim: true, maxlength: 120 },
  customerEmail: { type: String, default: "", trim: true, lowercase: true, maxlength: 254 },
  customerPhone: { type: String, default: "", trim: true, maxlength: 40 },
  status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
  messageCount: { type: Number, default: 0, min: 0 },
  lastMessageAt: { type: Date, required: true, default: Date.now, index: true },
  nextCustomerMessageAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

liveChatConversationSchema.index({ companyId: 1, workspaceId: 1, lastMessageAt: -1, _id: -1 });
liveChatConversationSchema.index({ companyId: 1, workspaceId: 1, createdAt: -1 });
liveChatConversationSchema.index(
  { companyId: 1, workspaceId: 1, visitorKeyHash: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } }
);
liveChatConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
liveChatConversationSchema.index({ companyId: 1, ipHash: 1, createdAt: -1 });

export const LiveChatConversation = models.LiveChatConversation ?? model("LiveChatConversation", liveChatConversationSchema);
