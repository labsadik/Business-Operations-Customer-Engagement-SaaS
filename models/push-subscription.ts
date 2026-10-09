import { Schema, model, models } from "mongoose";

const pushSubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true
    },
    endpoint: { type: String, required: true, maxlength: 4096 },
    p256dh: { type: String, required: true, maxlength: 256 },
    auth: { type: String, required: true, maxlength: 128 },
    expirationTime: { type: Number, default: null, min: 0 }
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscription =
  models.PushSubscription ?? model("PushSubscription", pushSubscriptionSchema);
