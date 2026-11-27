"use strict";

var crypto = require("crypto");

var COOKIE_NAME = "onyx_session";
var SESSION_TTL = 60 * 60 * 8; // 8 hours
var COOKIE_FLAGS = "Path=/; HttpOnly; SameSite=Strict";

function sessionSecret() {
  var secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is not configured (needs 32+ random characters)");
  }
  return secret;
}

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text) {
  return Buffer.from(String(text).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function hmac(body) {
  return b64url(crypto.createHmac("sha256", sessionSecret()).update(body).digest());
}

/* ---------- sessions ---------- */
function createSession() {
  var now = Math.floor(Date.now() / 1000);
  var payload = {
    sub: "admin",
    iat: now,
    exp: now + SESSION_TTL,
    jti: crypto.randomBytes(12).toString("hex")
  };
  var body = b64url(JSON.stringify(payload));
  return { token: body + "." + hmac(body), expires: payload.exp };
}

function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  var parts = token.split(".");
  if (parts.length !== 2) return null;
  var expected = hmac(parts[0]);
  var given = Buffer.from(parts[1]);
  var want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  try {
    var payload = JSON.parse(fromB64url(parts[0]));
    if (!payload || payload.sub !== "admin" || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

/* ---------- cookies ---------- */
function parseCookies(header) {
  var out = {};
  if (!header) return out;
  String(header).split(";").forEach(function (pair) {
    var index = pair.indexOf("=");
    if (index === -1) return;
    out[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  });
  return out;
}

function isSecure(req) {
  return req.headers["x-forwarded-proto"] === "https" || !!process.env.VERCEL;
}

function sessionCookie(req, token) {
  return COOKIE_NAME + "=" + token + "; " + COOKIE_FLAGS + "; Max-Age=" + SESSION_TTL +
    (isSecure(req) ? "; Secure" : "");
}

function clearedCookie(req) {
  return COOKIE_NAME + "=; " + COOKIE_FLAGS + "; Max-Age=0" + (isSecure(req) ? "; Secure" : "");
}

function sessionFromRequest(req) {
  var cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies[COOKIE_NAME]);
}

/* ---------- password hashing (scrypt) ---------- */
// scrypt is deliberately slow and salted, which is what you want for passwords.
// A plain SHA-256 digest is fast, so stolen hashes can be ground through billions
// of guesses per second. 64 MB of work per attempt makes that impractical.
var SCRYPT = { N: 65536, r: 8, p: 1 };
var SCRYPT_MAXMEM = 256 * 1024 * 1024;

function hashPassword(password, salt) {
  var keylen = 64;
  var useSalt = salt || crypto.randomBytes(16).toString("hex");
  var hash = crypto.scryptSync(String(password), useSalt, keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM
  }).toString("hex");
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, useSalt, hash].join("$");
}

function verifyPassword(password, stored) {
  var parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  var N = parseInt(parts[1], 10), r = parseInt(parts[2], 10), p = parseInt(parts[3], 10);
  var salt = parts[4], expected = Buffer.from(parts[5], "hex");
  if (!N || !r || !p || !salt || !expected.length) return false;
  var actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: N, r: r, p: p, maxmem: SCRYPT_MAXMEM
    });
  } catch (err) {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function verifyUsername(input, expected) {
  // Normalise with SHA-256 so both sides are the same length, then compare
  // without early exit, so a wrong username does not leak timing information.
  var a = crypto.createHash("sha256").update(String(input || "")).digest();
  var b = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------- request helpers ---------- */
function isPrivateHost(hostname) {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(hostname || "");
}

function isSameOrigin(req) {
  var origin = req.headers.origin;
  if (!origin) return true; // non-browser client

  var originUrl;
  try {
    originUrl = new URL(origin);
  } catch (err) {
    return false;
  }

  var allowed = [];
  [req.headers["x-forwarded-host"], req.headers.host].forEach(function (value) {
    if (!value) return;
    String(value).split(",").forEach(function (part) { if (part.trim()) allowed.push(part.trim()); });
  });
  if (process.env.APP_ORIGIN) {
    try { allowed.push(new URL(process.env.APP_ORIGIN).host); } catch (err) {}
  }
  if (allowed.indexOf(originUrl.host) !== -1) return true;

  // TLS-terminating proxy that keeps the public Origin but rewrites Host to a
  // private address (local preview tunnels). Production hosts stay strict.
  var host = String(req.headers.host || "").split(":")[0];
  if (req.headers["x-forwarded-proto"] === "https" && isPrivateHost(host)) return true;

  return false;
}

function clientIp(req) {
  var forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

var buckets = globalThis.__onyxRateBuckets || (globalThis.__onyxRateBuckets = new Map());

function rateLimit(key, limit, windowMs) {
  var now = Date.now();
  var entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    entry = { count: 0, reset: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfter: Math.ceil((entry.reset - now) / 1000)
  };
}

module.exports = {
  COOKIE_NAME: COOKIE_NAME,
  SESSION_TTL: SESSION_TTL,
  createSession: createSession,
  verifySession: verifySession,
  sessionFromRequest: sessionFromRequest,
  sessionCookie: sessionCookie,
  clearedCookie: clearedCookie,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  verifyUsername: verifyUsername,
  isSameOrigin: isSameOrigin,
  clientIp: clientIp,
  rateLimit: rateLimit
};
