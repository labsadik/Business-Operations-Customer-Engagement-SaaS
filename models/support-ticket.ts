import { Schema, model, models } from "mongoose";

const supportTicketSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
      immutable: true
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
      immutable: true
    },
    submitterUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true
    },
    submitterName: {
      type: String,
      trim: true,
      maxlength: 200,
      immutable: true
    },
    submitterEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      immutable: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      immutable: true
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
      immutable: true
    },
    dedupeKey: {
      type: String,
      required: true,
      index: true,
      immutable: true
    },
    status: {
      type: String,
      enum: ["NOT_SEEN", "PROCESSING", "COMPLETED"],
      default: "NOT_SEEN",
      required: true,
      index: true
    },
    statusChangedAt: {
      type: Date,
      index: true
    },
    statusChangedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    }
  },
  { timestamps: true }
);

supportTicketSchema.index({ companyId: 1, updatedAt: -1, _id: -1 });
supportTicketSchema.index({ companyId: 1, status: 1, updatedAt: -1, _id: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1, _id: -1 });
supportTicketSchema.index({ dedupeKey: 1, createdAt: -1 });

export const SupportTicket =
  models.SupportTicket ?? model("SupportTicket", supportTicketSchema);
