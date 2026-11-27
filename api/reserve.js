"use strict";

var crypto = require("crypto");
var auth = require("./_auth");
var http = require("./_http");
var store = require("./_store");

var TYPES = ["Guest list", "Table", "Booth"];
var DEFAULT_PRICES = { currency: "$", guest: 10, table: 150, booth: 300 };
var MAX_ITEMS = 500;

function toInt(value, fallback) {
  var n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

function cleanPrices(raw) {
  var out = { currency: "$", guest: DEFAULT_PRICES.guest, table: DEFAULT_PRICES.table, booth: DEFAULT_PRICES.booth };
  if (raw && typeof raw === "object") {
    ["guest", "table", "booth"].forEach(function (key) {
      var n = toInt(raw[key], out[key]);
      if (n >= 0 && n <= 100000) out[key] = n;
    });
  }
  return out;
}

function cleanDoc(raw) {
  var doc = raw && typeof raw === "object" ? raw : {};
  return {
    updated: typeof doc.updated === "string" ? doc.updated : new Date().toISOString().slice(0, 10),
    note: "Reservations made from /reserve.html. Guests pay at the door.",
    prices: cleanPrices(doc.prices),
    items: Array.isArray(doc.items) ? doc.items : []
  };
}

async function loadDoc() {
  var read = await store.readText(store.RESERVATIONS_PATH);
  if (!read.text) return cleanDoc(null);
  var parsed = null;
  try { parsed = JSON.parse(read.text); } catch (err) { parsed = null; }
  return cleanDoc(parsed);
}

function amountFor(prices, type, party) {
  if (type === "Table") return prices.table;
  if (type === "Booth") return prices.booth;
  return prices.guest * party;
}

function makeId() {
  return "ONX-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

module.exports = async function handler(req, res) {
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  /* Prices are public: the reservations page needs them before anyone submits. */
  if (req.method === "GET") {
    try {
      var doc = await loadDoc();
      return http.send(res, 200, { prices: doc.prices });
    } catch (err) {
      return http.send(res, 200, { prices: DEFAULT_PRICES, fallback: true });
    }
  }

  if (req.method === "POST") {
    var limit = auth.rateLimit("reserve:" + auth.clientIp(req), 5, 10 * 60 * 1000);
    if (!limit.allowed) {
      return http.send(res, 429, { error: "Too many requests. Give it a few minutes and try again." }, {
        "Retry-After": String(limit.retryAfter)
      });
    }

    var body;
    try {
      body = await http.readJson(req, 16 * 1024);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }
    if (!body || typeof body !== "object") return http.send(res, 400, { error: "Body must be a JSON object" });
    if (body.company) return http.send(res, 200, { ok: true }); // honeypot

    var night = String(body.night || "").replace(/\s+/g, " ").trim().slice(0, 140);
    var name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    var contact = String(body.contact || "").replace(/\s+/g, " ").trim().slice(0, 80);
    var notes = String(body.notes || "").trim().slice(0, 300);
    var party = toInt(body.party, 0);
    var type = TYPES.indexOf(body.type) !== -1 ? body.type : "Guest list";

    if (!night) return http.send(res, 400, { error: "Choose a night." });
    if (!name) return http.send(res, 400, { error: "A name is required." });
    if (!contact) return http.send(res, 400, { error: "A Discord username is required." });
    if (party < 1 || party > 20) return http.send(res, 400, { error: "Party size must be between 1 and 20." });
    if (body.confirm !== true) return http.send(res, 400, { error: "Confirm the amount due at the door." });

    try {
      var current = await loadDoc();
      var amount = amountFor(current.prices, type, party);
      var item = {
        id: makeId(),
        created: new Date().toISOString(),
        night: night,
        name: name,
        contact: contact,
        party: party,
        type: type,
        amount: amount,
        status: "reserved",
        notes: notes
      };

      current.items.unshift(item);
      current.items = current.items.slice(0, MAX_ITEMS);
      current.updated = new Date().toISOString().slice(0, 10);

      await store.writeText(
        store.RESERVATIONS_PATH,
        JSON.stringify(current, null, 2) + "\n",
        "Reservation " + item.id + " from the website"
      );

      return http.send(res, 200, { ok: true, id: item.id, amount: amount, currency: current.prices.currency });
    } catch (err) {
      return http.send(res, 502, { error: "That could not be saved right now. Message us on Discord and we will sort it." });
    }
  }

  return http.methodNotAllowed(res, "GET, POST");
};
