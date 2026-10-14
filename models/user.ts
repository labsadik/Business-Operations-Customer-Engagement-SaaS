import { Schema, model, models, type InferSchemaType } from "mongoose";
import { RESTORABLE_USER_ROLES, USER_ROLES } from "@/types/domain";

const publicCompanyLoginSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    firstLoginAt: { type: Date, required: true },
    lastLoginAt: { type: Date, required: true },
    loginCount: { type: Number, required: true, default: 1, min: 1 }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    image: { type: String },
    jobTitle: { type: String, trim: true, maxlength: 120, default: "" },
    department: { type: String, trim: true, maxlength: 100, default: "" },
    role: {
      type: String,
      enum: [...USER_ROLES],
      required: true,
      index: true
    },
    lastLoginAt: { type: Date },
    // Company-specific customer-page sign-ins are embedded on the existing user
    // record so the admin can audit genuine successful logins without a new collection.
    publicCompanyLogins: { type: [publicCompanyLoginSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
    platformAdminPreviousRole: {
      type: String,
      enum: [...RESTORABLE_USER_ROLES]
    }
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };
export const User = models.User ?? model("User", userSchema);