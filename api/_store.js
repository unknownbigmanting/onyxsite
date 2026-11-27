"use strict";

var fs = require("fs");
var path = require("path");

var CONTENT_PATH = "assets/data/content.json";

function githubConfig() {
  var token = process.env.GITHUB_TOKEN;
  var repo = process.env.GITHUB_REPO;
  if (!token || !repo) return null;
  return {
    token: token,
    repo: repo,
    branch: process.env.GITHUB_BRANCH || "main",
    path: CONTENT_PATH
  };
}

function localAllowed() {
  return process.env.ALLOW_LOCAL_STORE === "1";
}

function localPath() {
  return path.join(process.cwd(), CONTENT_PATH);
}

function githubUrl(cfg) {
  return "https://api.github.com/repos/" + cfg.repo + "/contents/" + cfg.path;
}

async function githubRead(cfg) {
  var res = await fetch(githubUrl(cfg) + "?ref=" + encodeURIComponent(cfg.branch), {
    headers: {
      Authorization: "Bearer " + cfg.token,
      Accept: "application/vnd.github+json",
      "User-Agent": "club-onyx-admin"
    }
  });
  if (!res.ok) throw new Error("GitHub read failed (" + res.status + ")");
  var data = await res.json();
  var text = Buffer.from(data.content || "", "base64").toString("utf8");
  return { text: text, sha: data.sha };
}

async function githubWrite(cfg, text, message) {
  var headers = {
    Authorization: "Bearer " + cfg.token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "club-onyx-admin"
  };

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

async function readContent() {
  var cfg = githubConfig();
  if (cfg) {
    var remote = await githubRead(cfg);
    return { text: remote.text, source: "github" };
  }
  if (localAllowed()) {
    return { text: fs.readFileSync(localPath(), "utf8"), source: "local" };
  }
  throw new Error("No content store configured. Set GITHUB_TOKEN and GITHUB_REPO on the deployment.");
}

async function writeContent(text, message) {
  var cfg = githubConfig();
  if (cfg) {
    var sha = await githubWrite(cfg, text, message);
    return { source: "github", commit: sha };
  }
  if (localAllowed()) {
    fs.writeFileSync(localPath(), text, "utf8");
    return { source: "local", commit: null };
  }
  throw new Error("No content store configured. Set GITHUB_TOKEN and GITHUB_REPO on the deployment.");
}

module.exports = {
  CONTENT_PATH: CONTENT_PATH,
  readContent: readContent,
  writeContent: writeContent,
  githubConfig: githubConfig
};
