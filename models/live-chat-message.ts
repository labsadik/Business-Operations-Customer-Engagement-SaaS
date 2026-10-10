import { Schema, model, models } from "mongoose";

const liveChatMessageSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: "LiveChatConversation", required: true, index: true },
  senderType: { type: String, enum: ["CUSTOMER", "AGENT"], required: true },
  senderUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

liveChatMessageSchema.index({ conversationId: 1, createdAt: 1, _id: 1 });
liveChatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
liveChatMessageSchema.index({ companyId: 1, workspaceId: 1, conversationId: 1 });

export const LiveChatMessage = models.LiveChatMessage ?? model("LiveChatMessage", liveChatMessageSchema);
