import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const withoutAlias = specifier.slice(2);
    const candidates = extname(withoutAlias)
      ? [resolve(repoRoot, withoutAlias)]
      : [
          resolve(repoRoot, withoutAlias + ".ts"),
          resolve(repoRoot, withoutAlias + ".tsx"),
          resolve(repoRoot, withoutAlias, "index.ts"),
          resolve(repoRoot, withoutAlias, "index.tsx")
        ];

    for (const candidate of candidates) {
      try {
        const url = pathToFileURL(candidate).href;
        return nextResolve(url, context);
      } catch {
        // Try the next supported TypeScript resolution candidate.
      }
    }
  }

  return nextResolve(specifier, context);
}
