import { readFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";

const packagePath = path.resolve("node_modules/@opentelemetry/api/package.json");

try {
  await access(packagePath);
} catch {
  console.error("[Cloudflare] @opentelemetry/api is not installed.");
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const moduleEntry = packageJson.module;
const mainEntry = packageJson.main;

if (moduleEntry === "build/esm/index.js" && typeof mainEntry === "string" && mainEntry.length > 0) {
  delete packageJson.module;
  await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
  console.log(
    `[Cloudflare] Patched @opentelemetry/api for OpenNext middleware bundling: using main (${mainEntry}).`
  );
} else {
  console.log("[Cloudflare] @opentelemetry/api does not need the OpenNext module-field workaround.");
}
