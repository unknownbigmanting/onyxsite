"use strict";

var auth = require("./_auth");
var http = require("./_http");
var store = require("./_store");

var TYPES = ["Guest list", "Table", "Booth"];
var STATUSES = ["reserved", "paid"];

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function num(value, fallback, max) {
  var n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), 0), max || 100000);
}

function cleanPrices(raw) {
  var prices = raw && typeof raw === "object" ? raw : {};
  return {
    currency: "$",
    guest: num(prices.guest, 10),
    table: num(prices.table, 150),
    booth: num(prices.booth, 300)
  };
}

function sanitize(input) {
  if (!input || typeof input !== "object") throw new Error("Body must be a JSON object");
  var items = Array.isArray(input.items) ? input.items : [];
  if (items.length > 500) throw new Error("Too many reservations (max 500)");

  var seen = new Set();
  var clean = [];
  items.forEach(function (raw) {
    if (!raw || typeof raw !== "object") return;
    var id = text(raw.id, 40) || "ONX-" + clean.length;
    if (seen.has(id)) return;
    seen.add(id);
    clean.push({
      id: id,
      created: text(raw.created, 40),
      night: text(raw.night, 140),
      name: text(raw.name, 80),
      contact: text(raw.contact, 80),
      party: Math.min(Math.max(parseInt(raw.party, 10) || 1, 1), 20),
      type: TYPES.indexOf(raw.type) !== -1 ? raw.type : "Guest list",
      amount: num(raw.amount, 0),
      status: STATUSES.indexOf(raw.status) !== -1 ? raw.status : "reserved",
      notes: text(raw.notes, 300)
    });
  });

  return {
    updated: new Date().toISOString().slice(0, 10),
    note: "Reservations made from /reserve.html. Guests pay at the door.",
    prices: cleanPrices(input.prices),
    items: clean
  };
}

module.exports = async function handler(req, res) {
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  var session = null;
  try {
    session = auth.sessionFromRequest(req);
  } catch (err) {
    return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing)." });
  }
  if (!session) return http.send(res, 401, { error: "Sign in to view reservations." });

  if (req.method === "GET") {
    try {
      var read = await store.readText(store.RESERVATIONS_PATH);
      var doc = null;
      if (read.text) {
        try { doc = JSON.parse(read.text); } catch (err) { doc = null; }
      }
      return http.send(res, 200, sanitize(doc || {}));
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  if (req.method === "PUT") {
    var body;
    try {
      body = await http.readJson(req, 256 * 1024);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }

    var clean;
    try {
      clean = sanitize(body);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }

    try {
      var saved = await store.writeText(
        store.RESERVATIONS_PATH,
        JSON.stringify(clean, null, 2) + "\n",
        "Update reservations from admin panel"
      );
      return http.send(res, 200, { ok: true, items: clean.items.length, commit: saved.commit || null });
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  return http.methodNotAllowed(res, "GET, PUT");
};
