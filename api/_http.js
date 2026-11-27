"use strict";

function send(res, status, payload, extraHeaders) {
  var body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (key) { res.setHeader(key, extraHeaders[key]); });
  }
  res.end(body);
}

function readJson(req, limitBytes) {
  var max = limitBytes || 256 * 1024;
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > max) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function methodNotAllowed(res, allowed) {
  send(res, 405, { error: "Method not allowed" }, { Allow: allowed });
}

module.exports = { send: send, readJson: readJson, methodNotAllowed: methodNotAllowed };
