import { Schema, model, models } from "mongoose";

// The migration seeds this single atomic counter to the highest company public ID.
const companySequenceSchema = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true, min: 100000 }
  },
  { versionKey: false, collection: "companysequences" }
);

export const CompanySequence =
  models.CompanySequence ?? model("CompanySequence", companySequenceSchema);
