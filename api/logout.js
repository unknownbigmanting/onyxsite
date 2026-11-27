"use strict";

var auth = require("./_auth");
var http = require("./_http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return http.methodNotAllowed(res, "POST");
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }
  return http.send(res, 200, { authenticated: false }, {
    "Set-Cookie": auth.clearedCookie(req)
  });
};
