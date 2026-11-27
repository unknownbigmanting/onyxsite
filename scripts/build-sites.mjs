// Builds what the edge deployment uploads:
//   dist/site/       the public files (no private data files)
//   dist/worker.js   the /api handlers bundled for the Workers runtime
//   dist/manifest.json
// Run with: node scripts/build-sites.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const publicDir = path.join(dist, "site");

const PAGES = ["index.html", "team.html", "events.html", "tickets.html", "careers.html", "contact.html", "admin.html"];
const PRIVATE_DATA = ["admin.json", "orders.json", "applications.json"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

PAGES.forEach(function (page) {
  fs.copyFileSync(path.join(root, page), path.join(publicDir, page));
});

fs.cpSync(path.join(root, "assets"), path.join(publicDir, "assets"), {
  recursive: true,
  filter: function (source) {
    const rel = path.relative(path.join(root, "assets"), source).split(path.sep).join("/");
    return !PRIVATE_DATA.some(function (name) { return rel === "data/" + name; });
  }
});

await build({
  entryPoints: [path.join(root, "worker/index.js")],
  outfile: path.join(dist, "worker.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  legalComments: "none",
  external: ["node:crypto", "node:path", "node:buffer", "node:fs"],
  alias: {
    crypto: path.join(root, "worker/shims/crypto.js"),
    path: path.join(root, "worker/shims/path.js"),
    fs: path.join(root, "worker/fs-stub.js")
  },
  logLevel: "warning"
});

const manifest = {
  entrypoint: "worker.js",
  compatibilityDate: new Date().toISOString().slice(0, 10),
  compatibilityFlags: ["nodejs_compat"],
  modules: [{ name: "worker.js", type: "esm", path: "./worker.js" }],
  assetsDirectory: "./site"
};
fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));

const size = fs.statSync(path.join(dist, "worker.js")).size;
console.log("built dist/ — worker " + Math.round(size / 1024) + " KB, site files: " +
  fs.readdirSync(publicDir).length + " entries");
