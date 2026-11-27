"use strict";

var account = require("./_account");
var auth = require("./_auth");
var http = require("./_http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return http.methodNotAllowed(res, "POST");
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  var limit = auth.rateLimit("login:" + auth.clientIp(req), 8, 15 * 60 * 1000);
  if (!limit.allowed) {
    return http.send(res, 429, { error: "Too many attempts. Try again in a few minutes." }, {
      "Retry-After": String(limit.retryAfter)
    });
  }

  var stored = null;
  try {
    stored = await account.readAccount();
  } catch (err) {
    // Store unreachable: fall through to the environment credentials below.
    stored = null;
  }

  var expectedUser = "";
  var storedHash = "";
  if (stored && stored.configured) {
    expectedUser = stored.username;
    storedHash = stored.hash;
  } else if (process.env.ADMIN_PASSWORD_HASH) {
    expectedUser = process.env.ADMIN_USERNAME || "admin";
    storedHash = process.env.ADMIN_PASSWORD_HASH;
  } else {
    return http.send(res, 500, { error: "No owner account yet. Reload /admin.html to set one up." });
  }

  var body;
  try {
    body = await http.readJson(req, 8 * 1024);
  } catch (err) {
    return http.send(res, 400, { error: err.message });
  }

  var username = body && typeof body.username === "string" ? body.username : "";
  var password = body && typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 80 || password.length > 400) {
    return http.send(res, 401, { error: "That username or password is not right." });
  }

  var userOk = auth.verifyUsername(username, expectedUser);
  var passOk = false;
  try {
    // Always run the hash so a wrong username cannot be identified by timing.
    passOk = auth.verifyPassword(password, storedHash);
  } catch (err) {
    passOk = false;
  }
  if (!userOk || !passOk) {
    return http.send(res, 401, { error: "That username or password is not right." });
  }

  var session;
  try {
    session = auth.createSession();
  } catch (err) {
    return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing)." });
  }

  return http.send(res, 200, { authenticated: true, expires: session.expires }, {
    "Set-Cookie": auth.sessionCookie(req, session.token)
  });
};
