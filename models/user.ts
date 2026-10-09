import { Schema, model, models, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    image: { type: String },
    jobTitle: { type: String, trim: true, maxlength: 120, default: "" },
    department: { type: String, trim: true, maxlength: 100, default: "" },
    role: {
      type: String,
      enum: ["CUSTOMER", "COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"],
      required: true,
      index: true
    },
    googleSubject: { type: String, index: true, sparse: true },
    googleEmail: { type: String, lowercase: true, trim: true },
    lastLoginAt: { type: Date },
    active: { type: Boolean, default: true, index: true },
    platformAdminPreviousRole: {
      type: String,
      enum: ["CUSTOMER", "COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"]
    }
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };
export const User = models.User ?? model("User", userSchema);