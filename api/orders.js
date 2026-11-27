"use strict";

var crypto = require("crypto");
var auth = require("./_auth");
var http = require("./_http");
var store = require("./_store");

var ORDERS_PATH = "assets/data/orders.json";
var MAX_ITEMS = 500;
var STATUSES = ["unpaid", "paid"];

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function toInt(value, fallback) {
  var n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

function emptyDoc() {
  return {
    updated: new Date().toISOString().slice(0, 10),
    note: "Ticket orders from /tickets.html. Everyone pays at the door.",
    items: []
  };
}

async function loadDoc() {
  var read = await store.readText(ORDERS_PATH);
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
    note: "Ticket orders from /tickets.html. Everyone pays at the door.",
    items: Array.isArray(doc.items) ? doc.items : []
  };
}

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: text(raw.id, 40) || "ONX-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    created: text(raw.created, 40),
    eventId: text(raw.eventId, 80),
    night: text(raw.night, 160),
    date: text(raw.date, 40),
    price: Math.min(Math.max(toInt(raw.price, 0), 0), 100000),
    qty: Math.min(Math.max(toInt(raw.qty, 1), 1), 20),
    total: Math.min(Math.max(toInt(raw.total, 0), 0), 2000000),
    icName: text(raw.icName, 60),
    roblox: text(raw.roblox, 40),
    notes: text(raw.notes, 300),
    status: STATUSES.indexOf(raw.status) !== -1 ? raw.status : "unpaid"
  };
}

async function eventPrice(eventId) {
  var content = await store.readContent();
  var doc = JSON.parse(content.text);
  var events = Array.isArray(doc.events) ? doc.events : [];
  var event = events.filter(function (ev) { return ev && ev.id === eventId; })[0];
  return event || null;
}

module.exports = async function handler(req, res) {
  if (!auth.isSameOrigin(req)) {
    return http.send(res, 403, { error: "Cross-origin request refused" });
  }

  /* Anyone can place an order; only the owner can read the list. */
  if (req.method === "POST") {
    var limit = auth.rateLimit("order:" + auth.clientIp(req), 6, 10 * 60 * 1000);
    if (!limit.allowed) {
      return http.send(res, 429, { error: "Too many orders from this browser. Try again later." }, {
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

    var eventId = text(body.eventId, 80);
    var icName = text(body.icName, 60);
    var roblox = text(body.roblox, 40);
    var qty = toInt(body.qty, 0);

    if (!eventId) return http.send(res, 400, { error: "Pick a night first." });
    if (icName.length < 2) return http.send(res, 400, { error: "Give us the IC name for the order." });
    if (roblox.length < 2) return http.send(res, 400, { error: "A Roblox username is required." });
    if (qty < 1 || qty > 20) return http.send(res, 400, { error: "You can buy between 1 and 20 tickets." });
    if (body.confirm !== true) return http.send(res, 400, { error: "Confirm the amount due at the door." });

    var event;
    try {
      event = await eventPrice(eventId);
    } catch (err) {
      return http.send(res, 502, { error: "The calendar could not be read. Try again in a minute." });
    }
    if (!event) return http.send(res, 400, { error: "That night is not on sale." });
    if (Date.parse(event.date) < Date.now() - 6 * 3600 * 1000) {
      return http.send(res, 400, { error: "That night has already happened." });
    }

    var price = Math.min(Math.max(Math.round(Number(event.ticket) || 0), 0), 100000);
    var order = {
      id: "ONX-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      created: new Date().toISOString(),
      eventId: event.id,
      night: text(event.title + " — " + event.displayDate, 160),
      date: text(event.date, 40),
      price: price,
      qty: qty,
      total: price * qty,
      icName: icName,
      roblox: roblox,
      notes: text(body.notes, 300),
      status: "unpaid"
    };

    try {
      var current = await loadDoc();
      current.items.unshift(order);
      current.items = current.items.slice(0, MAX_ITEMS);
      current.updated = new Date().toISOString().slice(0, 10);
      await store.writeText(
        ORDERS_PATH,
        JSON.stringify(current, null, 2) + "\n",
        "Ticket order " + order.id + " (" + order.qty + " × " + order.night + ")"
      );
      return http.send(res, 200, { ok: true, id: order.id, total: order.total, price: order.price, qty: order.qty });
    } catch (err) {
      return http.send(res, 502, { error: "The order could not be saved. Message us on Discord and we will sort it." });
    }
  }

  /* Everything below is owner-only. */
  var session = null;
  try {
    session = auth.sessionFromRequest(req);
  } catch (err) {
    return http.send(res, 500, { error: "Sessions are not configured (SESSION_SECRET missing)." });
  }
  if (!session) return http.send(res, 401, { error: "Sign in to see orders." });

  if (req.method === "GET") {
    try {
      var doc = await loadDoc();
      var items = doc.items.map(cleanItem).filter(Boolean);
      return http.send(res, 200, { updated: doc.updated, items: items });
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  if (req.method === "PUT") {
    var payload;
    try {
      payload = await http.readJson(req, 256 * 1024);
    } catch (err) {
      return http.send(res, 400, { error: err.message });
    }
    if (!payload || !Array.isArray(payload.items)) {
      return http.send(res, 400, { error: "items must be an array" });
    }
    if (payload.items.length > MAX_ITEMS) {
      return http.send(res, 400, { error: "Too many orders (max " + MAX_ITEMS + ")" });
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
        ORDERS_PATH,
        JSON.stringify({
          updated: new Date().toISOString().slice(0, 10),
          note: "Ticket orders from /tickets.html. Everyone pays at the door.",
          items: clean
        }, null, 2) + "\n",
        "Update ticket orders from admin panel"
      );
      return http.send(res, 200, { ok: true, items: clean.length, commit: saved.commit || null });
    } catch (err) {
      return http.send(res, 502, { error: err.message });
    }
  }

  return http.methodNotAllowed(res, "GET, POST, PUT");
};
