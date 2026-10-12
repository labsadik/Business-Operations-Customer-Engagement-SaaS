import { Schema } from "mongoose";

type AddressField = "line1" | "line2" | "city" | "state" | "postalCode" | "country";

type AddressSchemaOptions = {
  trim?: boolean;
  enforceMaxLength?: boolean;
  defaults?: Partial<Record<AddressField, string>>;
};

const ADDRESS_MAX_LENGTHS: Record<AddressField, number> = {
  line1: 200,
  line2: 200,
  city: 100,
  state: 100,
  postalCode: 30,
  country: 100
};

/**
 * Shared address shape for company profiles, platform legal details and
 * immutable invoice snapshots. Per-model formatting/default behavior remains
 * configurable because snapshots should preserve their historical values.
 */
export function createAddressSchema(options: AddressSchemaOptions = {}) {
  const field = (name: AddressField) => ({
    type: String,
    ...(options.trim ? { trim: true } : {}),
    ...(options.enforceMaxLength ? { maxlength: ADDRESS_MAX_LENGTHS[name] } : {}),
    ...(options.defaults?.[name] !== undefined ? { default: options.defaults[name] } : {})
  });

  return new Schema(
    {
      line1: field("line1"),
      line2: field("line2"),
      city: field("city"),
      state: field("state"),
      postalCode: field("postalCode"),
      country: field("country")
    },
    { _id: false }
  );
}
