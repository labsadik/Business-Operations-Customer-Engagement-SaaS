import { Schema, model, models } from "mongoose";

const liveChatSettingsSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  publicWidgetEnabled: { type: Boolean, default: false, required: true },
  title: { type: String, trim: true, default: "Chat with us", maxlength: 80 },
  welcomeMessage: { type: String, trim: true, default: "Hello! How can we help?", maxlength: 300 },
  primaryColor: { type: String, default: "#2563eb", match: /^#[0-9a-fA-F]{6}$/ },
  theme: { type: String, enum: ["LIGHT", "DARK"], default: "LIGHT" },
  position: { type: String, enum: ["LEFT", "RIGHT"], default: "RIGHT" },
  collectName: { type: Boolean, default: false },
  collectEmail: { type: Boolean, default: false },
  collectPhone: { type: Boolean, default: false },
  offlineMode: { type: Boolean, default: false },
  allowedDomains: { type: [String], default: [] }
}, { timestamps: true });

liveChatSettingsSchema.index({ companyId: 1, workspaceId: 1 }, { unique: true });

export const LiveChatSettings = models.LiveChatSettings ?? model("LiveChatSettings", liveChatSettingsSchema);
