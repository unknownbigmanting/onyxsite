// Local development server: static files + the /api routes, no dependencies.
// Usage: npm run dev  (or: node server.mjs)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return;
    if (process.env[match[1]] !== undefined) return;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  });
}

loadEnv(path.join(root, ".env"));
process.env.ALLOW_LOCAL_STORE = process.env.ALLOW_LOCAL_STORE || "1";

const PORT = Number(process.env.PORT || 3000);
const API_ROUTES = new Set(["login", "logout", "session", "setup", "content", "orders"]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (err) {
    return json(res, 400, { error: "Bad request" });
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    const name = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
    if (!API_ROUTES.has(name)) return json(res, 404, { error: "Unknown endpoint" });
    const file = path.join(root, "api", name + ".js");
    try {
      delete require.cache[require.resolve(file)];
      const handler = require(file);
      const mod = handler && handler.default ? handler.default : handler;
      await mod(req, res);
    } catch (err) {
      console.error("[api]", err);
      if (!res.headersSent) json(res, 500, { error: err.message });
    }
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (err) {
    return json(res, 400, { error: "Bad path" });
  }

  // Private data files are reachable only through /api, never as static files.
  if (pathname === "/assets/data/admin.json" || pathname === "/assets/data/orders.json") {
    return json(res, 404, { error: "Not found" });
  }

  if (pathname.endsWith("/")) pathname += "index.html";
  if (!path.extname(pathname)) pathname += ".html";
  if (pathname.split("/").some((part) => part.startsWith("."))) {
    return json(res, 404, { error: "Not found" });
  }

  const file = path.join(root, pathname);
  if (!file.startsWith(root + path.sep)) return json(res, 404, { error: "Not found" });

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return json(res, 404, { error: "Not found" });
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    if (file.endsWith(".html") || file.endsWith(".json")) res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Club Onyx dev server → http://localhost:" + PORT);
  if (!process.env.ADMIN_PASSWORD_HASH) {
    console.log("· Admin login is off: add ADMIN_PASSWORD_HASH and SESSION_SECRET to .env (see .env.example).");
  }
});
