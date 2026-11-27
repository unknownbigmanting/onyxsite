"use strict";

var auth = require("./_auth");
var http = require("./_http");
var store = require("./_store");
var schema = require("./_schema");

module.exports = async function handler(req, res) {
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  if (req.method === "GET") {
    try {
      var current = await store.readContent();
      return http.send(res, 200, JSON.parse(current.text));
    } catch (err) {
      return http.send(res, 503, { error: err.message });
    }
  }

  if (req.method === "PUT") {
    var session = null;
    try {
      session = auth.sessionFromRequest(req);
    } catch (err) {
      return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing)." });
    }
    if (!session) return http.send(res, 401, { error: "Sign in to save changes." });

    var limit = auth.rateLimit("save:" + auth.clientIp(req), 30, 5 * 60 * 1000);
    if (!limit.allowed) {
      return http.send(res, 429, { error: "Too many saves. Wait a moment." }, {
        "Retry-After": String(limit.retryAfter)
      });
    }

    var body;
    try {
      body = await http.readJson(req, 512 * 1024);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }

    var doc;
    try {
      doc = schema.sanitize(body);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }

    try {
      var saved = await store.writeContent(JSON.stringify(doc, null, 2) + "\n", "Update site content from admin panel");
      return http.send(res, 200, {
        ok: true,
        updated: doc.updated,
        source: saved.source,
        commit: saved.commit || null
      });
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  return http.methodNotAllowed(res, "GET, PUT");
};
