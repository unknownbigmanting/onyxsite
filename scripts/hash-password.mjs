// Prints an scrypt hash for ADMIN_PASSWORD_HASH.
// Usage: node scripts/hash-password.mjs "your long admin password"
//
// scrypt is salted and deliberately memory-hard (64 MB per attempt), which is the
// right thing for passwords. A bare SHA-256 digest is fast, so it is the wrong tool.
import crypto from "node:crypto";

const password = process.argv.slice(2).join(" ");

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your long admin password"');
  console.error("Use at least 12 characters. This hash is safe to put in env vars.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Pick at least 12 characters — this is the only gate on the admin panel.");
  process.exit(1);
}

const N = 65536, r = 8, p = 1, keylen = 64;
const maxmem = 256 * 1024 * 1024;
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem }).toString("hex");

console.log("ADMIN_PASSWORD_HASH=" + ["scrypt", N, r, p, salt, hash].join("$"));
console.log("");
console.log("Also set a username (optional — defaults to \"admin\"):");
console.log("ADMIN_USERNAME=admin");
