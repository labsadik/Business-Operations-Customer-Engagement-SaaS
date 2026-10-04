import { fileURLToPath, pathToFileURL } from "node:url";
import { extname, resolve as resolvePath } from "node:path";

const repoRoot = resolvePath(fileURLToPath(new URL("..", import.meta.url)));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const withoutAlias = specifier.slice(2);
    const candidates = extname(withoutAlias)
      ? [resolvePath(repoRoot, withoutAlias)]
      : [
          resolvePath(repoRoot, withoutAlias + ".ts"),
          resolvePath(repoRoot, withoutAlias + ".tsx"),
          resolvePath(repoRoot, withoutAlias, "index.ts"),
          resolvePath(repoRoot, withoutAlias, "index.tsx")
        ];

    for (const candidate of candidates) {
      try {
        return nextResolve(pathToFileURL(candidate).href, context);
      } catch {
        // Continue with the next supported TypeScript resolution candidate.
      }
    }
  }

  return nextResolve(specifier, context);
}
