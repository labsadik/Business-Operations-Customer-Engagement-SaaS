import fs from "node:fs";
import path from "node:path";

/**
 * Load local environment files for standalone Node scripts.
 * Existing shell/CI/host environment variables always win over file values.
 */
export function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.resolve(fileName);
    if (!fs.existsSync(filePath)) continue;
    const source = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;

      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
}

export function mongoDatabaseName() {
  return process.env.MONGODB_DB_NAME?.trim() || "Canvas";
}
