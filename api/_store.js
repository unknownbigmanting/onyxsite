"use strict";

var fs = require("fs");
var path = require("path");

var CONTENT_PATH = "assets/data/content.json";
var ORDERS_PATH = "assets/data/orders.json";
var APPLICATIONS_PATH = "assets/data/applications.json";

function githubConfig(filePath) {
  var token = process.env.GITHUB_TOKEN;
  var repo = process.env.GITHUB_REPO;
  if (!token || !repo) return null;
  return {
    token: token,
    repo: repo,
    branch: process.env.GITHUB_BRANCH || "main",
    path: filePath || CONTENT_PATH
  };
}

function localAllowed() {
  return process.env.ALLOW_LOCAL_STORE === "1";
}

function localPath(filePath) {
  return path.join(process.cwd(), filePath);
}

function githubUrl(cfg) {
  return "https://api.github.com/repos/" + cfg.repo + "/contents/" + cfg.path;
}

function githubHeaders(cfg) {
  return {
    Authorization: "Bearer " + cfg.token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "club-onyx-admin"
  };
}

async function githubRead(cfg) {
  var res = await fetch(githubUrl(cfg) + "?ref=" + encodeURIComponent(cfg.branch), {
    headers: githubHeaders(cfg)
  });
  if (res.status === 404) return { text: null, sha: null, missing: true };
  if (!res.ok) throw new Error("GitHub read failed (" + res.status + ")");
  var data = await res.json();
  var text = Buffer.from(data.content || "", "base64").toString("utf8");
  return { text: text, sha: data.sha };
}

async function githubWrite(cfg, text, message) {
  var headers = githubHeaders(cfg);

  var sha = null;
  var current = await fetch(githubUrl(cfg) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers });
  if (current.ok) {
    var meta = await current.json();
    sha = meta.sha;
  } else if (current.status !== 404) {
    throw new Error("GitHub read failed (" + current.status + ")");
  }

  var body = {
    message: message || "Update site content",
    content: Buffer.from(text, "utf8").toString("base64"),
    branch: cfg.branch
  };
  if (sha) body.sha = sha;

  var res = await fetch(githubUrl(cfg), { method: "PUT", headers: headers, body: JSON.stringify(body) });
  if (!res.ok) {
    var detail = await res.text();
    throw new Error("GitHub write failed (" + res.status + "): " + detail.slice(0, 200));
  }
  var data = await res.json();
  return data.commit ? data.commit.sha : null;
}

/* Read any JSON/text file from the configured store. Returns { text: null } when
   the file does not exist yet, so callers can fall back to defaults. */
async function readText(filePath) {
  var cfg = githubConfig(filePath);
  if (cfg) {
    var remote = await githubRead(cfg);
    return { text: remote.text, source: "github", missing: !!remote.missing };
  }
  if (localAllowed()) {
    var file = localPath(filePath);
    if (!fs.existsSync(file)) return { text: null, source: "local", missing: true };
    return { text: fs.readFileSync(file, "utf8"), source: "local" };
  }
  throw new Error("No content store configured. Set GITHUB_TOKEN and GITHUB_REPO on the deployment.");
}

async function writeText(filePath, text, message) {
  var cfg = githubConfig(filePath);
  if (cfg) {
    var sha = await githubWrite(cfg, text, message);
    return { source: "github", commit: sha };
  }
  if (localAllowed()) {
    var file = localPath(filePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
    return { source: "local", commit: null };
  }
  throw new Error("No content store configured. Set GITHUB_TOKEN and GITHUB_REPO on the deployment.");
}

async function readContent() {
  var read = await readText(CONTENT_PATH);
  if (!read.text) throw new Error("content.json is missing from the repository.");
  return { text: read.text, source: read.source };
}

async function writeContent(text, message) {
  return writeText(CONTENT_PATH, text, message);
}

module.exports = {
  CONTENT_PATH: CONTENT_PATH,
  ORDERS_PATH: ORDERS_PATH,
  APPLICATIONS_PATH: APPLICATIONS_PATH,
  readText: readText,
  writeText: writeText,
  readContent: readContent,
  writeContent: writeContent,
  githubConfig: githubConfig
};
