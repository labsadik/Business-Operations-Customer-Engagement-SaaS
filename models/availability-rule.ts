import { Schema, model, models } from "mongoose";

const availabilityRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 1, max: 1440 },
    timezone: { type: String, required: true, default: "Asia/Kolkata" },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

availabilityRuleSchema.index({ employeeId: 1, dayOfWeek: 1, startMinute: 1 });

export const AvailabilityRule =
  models.AvailabilityRule ?? model("AvailabilityRule", availabilityRuleSchema);