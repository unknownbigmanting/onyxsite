"use strict";

var crypto = require("crypto");
var auth = require("./_auth");
var http = require("./_http");
var store = require("./_store");

var APPLICATIONS_PATH = "assets/data/applications.json";
var MAX_ITEMS = 500;
var STATUSES = ["received", "review", "interview", "accepted", "declined"];
var ROLES = ["Head of Security", "Head of Hospitality", "Security", "Server / Floor Staff", "Any role"];

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function multiline(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function yesNo(value) {
  return value === "yes" || value === "no" ? value : "";
}

function emptyDoc() {
  return {
    updated: new Date().toISOString().slice(0, 10),
    note: "Crew applications from /careers.html. The status is what the applicant sees when they check their username.",
    items: []
  };
}

async function loadDoc() {
  var read = await store.readText(APPLICATIONS_PATH);
  if (!read.text) return emptyDoc();
  var parsed = null;
  try {
    parsed = JSON.parse(read.text);
  } catch (err) {
    parsed = null;
  }
  var doc = parsed && typeof parsed === "object" ? parsed : {};
  return {
    updated: typeof doc.updated === "string" ? doc.updated : new Date().toISOString().slice(0, 10),
    note: emptyDoc().note,
    items: Array.isArray(doc.items) ? doc.items : []
  };
}

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: text(raw.id, 40) || "APP-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    created: text(raw.created, 40),
    roblox: text(raw.roblox, 40),
    discord: text(raw.discord, 60),
    icName: text(raw.icName, 60),
    timezone: text(raw.timezone, 24),
    role: ROLES.indexOf(raw.role) !== -1 ? raw.role : "",
    gunLicense: yesNo(raw.gunLicense),
    meleePass: yesNo(raw.meleePass),
    why: multiline(raw.why, 1200),
    experience: multiline(raw.experience, 1200),
    extra: multiline(raw.extra, 600),
    note: text(raw.note, 240),
    status: STATUSES.indexOf(raw.status) !== -1 ? raw.status : "received",
    updated: text(raw.updated, 40)
  };
}

function publicView(item) {
  return {
    id: item.id,
    roblox: item.roblox,
    icName: item.icName,
    role: item.role,
    status: item.status,
    created: item.created,
    updated: item.updated || item.created,
    note: item.note
  };
}

module.exports = async function handler(req, res) {
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  var url = new URL(req.url, "http://localhost");
  var lookup = text(url.searchParams.get("username"), 40);

  /* ---------- Apply ---------- */
  if (req.method === "POST") {
    var limit = auth.rateLimit("apply:" + auth.clientIp(req), 3, 60 * 60 * 1000);
    if (!limit.allowed) {
      return http.send(res, 429, { error: "That is a few applications already. Try again in an hour." }, {
        "Retry-After": String(limit.retryAfter)
      });
    }

    var body;
    try {
      body = await http.readJson(req, 32 * 1024);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }
    if (!body || typeof body !== "object") return http.send(res, 400, { error: "Body must be a JSON object" });
    if (body.company) return http.send(res, 200, { ok: true }); // honeypot

    var roblox = text(body.roblox, 40);
    var discord = text(body.discord, 60);
    var icName = text(body.icName, 60);
    var timezone = text(body.timezone, 24);
    var role = ROLES.indexOf(body.role) !== -1 ? body.role : "";
    var gunLicense = yesNo(body.gunLicense);
    var meleePass = yesNo(body.meleePass);
    var why = multiline(body.why, 1200);

    if (roblox.length < 2) return http.send(res, 400, { error: "We need your Roblox username." });
    if (discord.length < 2) return http.send(res, 400, { error: "We need your Discord username." });
    if (icName.length < 2) return http.send(res, 400, { error: "Give us the IC name you would use." });
    if (!role) return http.send(res, 400, { error: "Pick the role you are applying for." });
    if (!gunLicense) return http.send(res, 400, { error: "Say whether you have a gun licence." });
    if (!meleePass) return http.send(res, 400, { error: "Say whether you have the melee gamepass." });
    if (why.length < 30) return http.send(res, 400, { error: "Tell us in a couple of sentences why you are suitable." });

    var application = {
      id: "APP-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      roblox: roblox,
      discord: discord,
      icName: icName,
      timezone: timezone,
      role: role,
      gunLicense: gunLicense,
      meleePass: meleePass,
      why: why,
      experience: multiline(body.experience, 1200),
      extra: multiline(body.extra, 600),
      note: "",
      status: "received"
    };

    try {
      var doc = await loadDoc();
      var open = doc.items.some(function (item) {
        return String(item.roblox || "").toLowerCase() === roblox.toLowerCase() &&
          ["received", "review", "interview"].indexOf(item.status) !== -1;
      });
      if (open) {
        return http.send(res, 409, { error: "There is already an open application on that username. Check its status below." });
      }

      doc.items.unshift(cleanItem(application));
      doc.items = doc.items.slice(0, MAX_ITEMS);
      doc.updated = new Date().toISOString().slice(0, 10);
      await store.writeText(
        APPLICATIONS_PATH,
        JSON.stringify(doc, null, 2) + "\n",
        "Application " + application.id + " (" + application.role + ")"
      );
      return http.send(res, 200, { ok: true, id: application.id });
    } catch (err) {
      return http.send(res, 502, { error: "The application could not be saved. Try again, or find us on Discord." });
    }
  }

  /* ---------- Status check (public, one username) ---------- */
  if (req.method === "GET" && lookup) {
    var lookLimit = auth.rateLimit("applylookup:" + auth.clientIp(req), 30, 60 * 60 * 1000);
    if (!lookLimit.allowed) {
      return http.send(res, 429, { error: "Too many checks from this browser. Try again shortly." }, {
        "Retry-After": String(lookLimit.retryAfter)
      });
    }

    try {
      var found = await loadDoc();
      var matches = found.items.filter(function (item) {
        return String(item.roblox || "").toLowerCase() === lookup.toLowerCase();
      });
      matches.sort(function (a, b) { return Date.parse(b.created) - Date.parse(a.created); });
      var latest = matches[0] ? cleanItem(matches[0]) : null;
      return http.send(res, 200, latest
        ? { ok: true, found: true, application: publicView(latest) }
        : { ok: true, found: false });
    } catch (err) {
      return http.send(res, 502, { error: "The applications could not be read. Try again in a minute." });
    }
  }

  /* ---------- Everything below is owner-only ---------- */
  var session = null;
  try {
    session = auth.sessionFromRequest(req);
  } catch (err) {
    return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing)." });
  }
  if (!session) return http.send(res, 401, { error: "Sign in to see applications." });

  if (req.method === "GET") {
    try {
      var list = await loadDoc();
      return http.send(res, 200, { updated: list.updated, items: list.items.map(cleanItem).filter(Boolean) });
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  if (req.method === "PUT") {
    var payload;
    try {
      payload = await http.readJson(req, 1024 * 1024);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }
    if (!payload || !Array.isArray(payload.items)) {
      return http.send(res, 400, { error: "items must be an array" });
    }
    if (payload.items.length > MAX_ITEMS) {
      return http.send(res, 400, { error: "Too many applications (max " + MAX_ITEMS + ")" });
    }

    var seen = new Set();
    var clean = [];
    payload.items.forEach(function (raw) {
      var item = cleanItem(raw);
      if (!item || seen.has(item.id)) return;
      seen.add(item.id);
      clean.push(item);
    });

    try {
      var saved = await store.writeText(
        APPLICATIONS_PATH,
        JSON.stringify({
          updated: new Date().toISOString().slice(0, 10),
          note: emptyDoc().note,
          items: clean
        }, null, 2) + "\n",
        "Update crew applications from admin panel"
      );
      return http.send(res, 200, { ok: true, items: clean.length, commit: saved.commit || null });
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  return http.methodNotAllowed(res, "GET, POST, PUT");
};
