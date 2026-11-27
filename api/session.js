"use strict";

var account = require("./_account");
var auth = require("./_auth");
var http = require("./_http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return http.methodNotAllowed(res, "GET");

  var configured = false;
  try {
    var current = await account.readAccount();
    configured = current.configured;
  } catch (err) {
    configured = false;
  }

  var session = null;
  try {
    session = auth.sessionFromRequest(req);
  } catch (err) {
    return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing).", configured: configured });
  }
  if (!session) return http.send(res, 200, { authenticated: false, configured: configured });
  return http.send(res, 200, { authenticated: true, configured: true, expires: session.exp });
};
