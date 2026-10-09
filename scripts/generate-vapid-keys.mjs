import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1"
});
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error("Unable to export VAPID key material");
}
const publicBytes = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicJwk.x, "base64url"),
  Buffer.from(publicJwk.y, "base64url")
]);

console.log("WEB_PUSH_VAPID_PUBLIC_KEY=" + publicBytes.toString("base64url"));
console.log("WEB_PUSH_VAPID_PRIVATE_KEY=" + privateJwk.d);
console.log("WEB_PUSH_VAPID_SUBJECT=mailto:replace-with-your-admin-email@example.com");
console.log("\nStore the private key only in server environment variables. Never expose it to the browser.");
