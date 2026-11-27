"use strict";

var account = require("./_account");
var auth = require("./_auth");
var http = require("./_http");

var USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;

module.exports = async function handler(req, res) {
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  if (req.method === "GET") {
    try {
      var current = await account.readAccount();
      return http.send(res, 200, { configured: current.configured });
    } catch (err) {
      return http.send(res, 200, { configured: false, store: false, error: err.message });
    }
  }

  if (req.method !== "POST") return http.methodNotAllowed(res, "GET, POST");

  var limit = auth.rateLimit("setup:" + auth.clientIp(req), 4, 60 * 60 * 1000);
  if (!limit.allowed) {
    return http.send(res, 429, { error: "Too many setup attempts. Try again later." }, {
      "Retry-After": String(limit.retryAfter)
    });
  }

  var body;
  try {
    body = await http.readJson(req, 8 * 1024);
  } catch (err) {
    return http.send(res, 400, { error: err.message });
  }

  var username = body && typeof body.username === "string" ? body.username.trim() : "";
  var password = body && typeof body.password === "string" ? body.password : "";

  if (!USERNAME_RE.test(username)) {
    return http.send(res, 400, { error: "Usernames are 3–40 characters: letters, numbers, dot, dash or underscore." });
  }
  if (password.length < 12) {
    return http.send(res, 400, { error: "Use at least 12 characters for the password." });
  }
  if (password.length > 400) {
    return http.send(res, 400, { error: "That password is too long." });
  }

  var created;
  try {
    created = await account.createAccount(username, password);
  } catch (err) {
    if (err.code === "ALREADY_CONFIGURED") {
      return http.send(res, 409, { error: "An owner account already exists. Sign in instead." });
    }
    return http.send(res, 502, { error: "Could not save the account: " + err.message });
  }

  var session;
  try {
    session = auth.createSession();
  } catch (err) {
    return http.send(res, 200, { ok: true, username: created.username, authenticated: false });
  }

  return http.send(res, 200, { ok: true, username: created.username, authenticated: true, expires: session.expires }, {
    "Set-Cookie": auth.sessionCookie(req, session.token)
  });
};
