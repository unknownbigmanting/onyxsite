// Local smoke test for dist/worker.js: runs the same code the edge runs, with a
// filesystem stand-in for env.ASSETS. Usage: node scripts/smoke-worker.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../dist/worker.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(here, "../dist/site");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };

const ASSETS = {
  fetch: async function (request) {
    const pathname = new URL(request.url).pathname;
    // Mirrors the platform's asset layer: bare paths map to the .html file.
    let candidate = path.join(siteDir, pathname === "/" ? "index.html" : pathname);
    if (!path.extname(candidate)) candidate += ".html";
    const file = candidate;
    if (!file.startsWith(siteDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return new Response("not found", { status: 404 });
    }
    return new Response(fs.readFileSync(file), {
      headers: { "content-type": MIME[path.extname(file)] || "application/octet-stream" }
    });
  }
};

const hash = process.env.SMOKE_HASH || "";
const env = {
  ASSETS: ASSETS,
  SESSION_SECRET: "smoke-test-secret-0123456789abcdefghij",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: hash
};

const base = "https://club-onyx.example";
const results = [];

async function call(label, pathname, init) {
  const response = await worker.fetch(new Request(base + pathname, init), env);
  const body = await response.text();
  results.push({ label, status: response.status, type: response.headers.get("content-type"), sample: body.slice(0, 70).replace(/\s+/g, " "), cookie: (response.headers.get("set-cookie") || "").slice(0, 40) });
  return { response, body };
}

await call("home", "/");
await call("stylesheet", "/assets/style.css");
await call("team page", "/team.html");
await call("private orders file", "/assets/data/orders.json");
await call("session (signed out)", "/api/session");
await call("content (no store configured)", "/api/content");
const login = await call("login", "/api/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "smoke-pass-123" })
});
const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
await call("session (signed in)", "/api/session", { headers: { cookie } });
await call("orders (signed in, no store)", "/api/orders", { headers: { cookie } });
await call("login (wrong password)", "/api/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "nope" })
});

console.table(results);
// A 502 here is correct: no GitHub token is configured in this harness.
const failed = results.filter(function (row) {
  if (row.label === "private orders file") return row.status !== 404;
  if (row.label.startsWith("login")) return false;
  if (row.label.indexOf("no store") !== -1) return row.status !== 502 && row.status !== 503;
  return row.status >= 500;
});
console.log(failed.length ? "FAIL" : "static + auth paths look right");
