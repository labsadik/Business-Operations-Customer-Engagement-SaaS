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
  geoCountry: { type: String, default: "", maxlength: 80 },
  geoCity: { type: String, default: "", maxlength: 120 },
  geoRegion: { type: String, default: "", maxlength: 120 },
  ipDisplay: { type: String, default: "", maxlength: 64 },
  browser: { type: String, default: "", maxlength: 100 },
  os: { type: String, default: "", maxlength: 100 },
  deviceType: { type: String, enum: ["DESKTOP", "MOBILE", "TABLET"], default: "DESKTOP" },
  referrer: { type: String, default: "", maxlength: 1024 },
  assignedAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  unreadAgentCount: { type: Number, default: 0, min: 0 },
  lastMessagePreview: { type: String, default: "", maxlength: 240 },
  status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
  messageCount: { type: Number, default: 0, min: 0 },
  lastMessageAt: { type: Date, required: true, default: Date.now, index: true },
  nextCustomerMessageAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
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
