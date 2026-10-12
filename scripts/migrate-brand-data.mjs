import mongoose from "mongoose";
import { loadLocalEnv } from "./lib/env.mjs";

loadLocalEnv();

const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error("MONGODB_URI is not configured");

// Supply exact previous values from the current database configuration at run time.
const previousMerchantCode = process.env.MIGRATION_PREVIOUS_MERCHANT_CODE?.trim();
const previousProductName = process.env.MIGRATION_PREVIOUS_PRODUCT_NAME?.trim();
const previousMerchantName = process.env.MIGRATION_PREVIOUS_MERCHANT_NAME?.trim();
if (!previousMerchantCode || !previousProductName || !previousMerchantName) {
  throw new Error(
    "MIGRATION_SOURCE_VALUES_REQUIRED: set MIGRATION_PREVIOUS_MERCHANT_CODE, MIGRATION_PREVIOUS_PRODUCT_NAME, and MIGRATION_PREVIOUS_MERCHANT_NAME using exact current database values."
  );
}

const apply = process.argv.includes("--apply");
const databaseName = process.env.MONGODB_DB_NAME?.trim();
if (!databaseName) {
  throw new Error("MONGODB_DB_NAME_REQUIRED_FOR_BRAND_MIGRATION: set the exact existing database name explicitly.");
}
const replaceText = (value) => {
  if (typeof value !== "string") return value;
  return value
    .split(previousProductName).join("Canvas")
    .split(previousMerchantName).join("AlgoQuit");
};

await mongoose.connect(uri, { dbName: databaseName });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MONGODB_CONNECTION_UNAVAILABLE");

  const payments = db.collection("payments");
  const invoices = db.collection("invoices");
  const settings = db.collection("platformsettings");

  const paymentCount = await payments.countDocuments({ merchantAccount: previousMerchantCode });
  let invoiceCount = 0;
  let settingsCount = 0;

  for await (const invoice of invoices.find({})) {
    const merchant = invoice.merchantSnapshot ?? {};
    const nextMerchant = {
      ...merchant,
      name: "AlgoQuit",
      description: replaceText(merchant.description) || "Canvas by AlgoQuit",
      logoUrl: "/favicon.svg",
      websiteUrl: "https://canvas.algoquit.com"
    };
    const nextServiceDescription = replaceText(invoice.serviceDescription) || "Canvas monthly scheduling service";
    const changed =
      merchant.name !== nextMerchant.name ||
      merchant.description !== nextMerchant.description ||
      merchant.logoUrl !== nextMerchant.logoUrl ||
      merchant.websiteUrl !== nextMerchant.websiteUrl ||
      invoice.serviceDescription !== nextServiceDescription;
    if (!changed) continue;
    invoiceCount += 1;
    if (apply) {
      await invoices.updateOne(
        { _id: invoice._id },
        { $set: { merchantSnapshot: nextMerchant, serviceDescription: nextServiceDescription } }
      );
    }
  }

  const platformSettings = await settings.findOne({ key: "default" });
  if (platformSettings) settingsCount = 1;

  if (apply) {
    if (paymentCount) {
      await payments.updateMany(
        { merchantAccount: previousMerchantCode },
        { $set: { merchantAccount: "ALGOQUIT" } }
      );
    }
    if (platformSettings) {
      await settings.updateOne(
        { _id: platformSettings._id },
        {
          $set: {
            legalName: "AlgoQuit",
            description: replaceText(platformSettings.description) || "Canvas by AlgoQuit",
            websiteUrl: "https://canvas.algoquit.com",
            logoUrl: "/favicon.svg"
          }
        }
      );
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    databaseName,
    paymentRecordsToUpdate: paymentCount,
    invoicesToUpdate: invoiceCount,
    platformSettingsRecordsToUpdate: settingsCount,
    canonicalWebsite: "https://canvas.algoquit.com"
  }, null, 2));

  if (!apply) console.log("No changes were written. Review the counts and rerun with --apply to perform the migration.");
} finally {
  await mongoose.disconnect();
}
