"use strict";

var auth = require("./_auth");
var http = require("./_http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return http.methodNotAllowed(res, "GET");
  var session = null;
  try {
    session = auth.sessionFromRequest(req);
  } catch (err) {
    return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing)." });
  }
  if (!session) return http.send(res, 200, { authenticated: false });
  return http.send(res, 200, { authenticated: true, expires: session.exp });
};
