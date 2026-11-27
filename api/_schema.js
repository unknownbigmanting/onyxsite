"use strict";

var TAGS = ["club", "community", "special"];
var STATUSES = ["open", "limited", "soldout", "announced"];

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function multiline(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function safePhoto(value) {
  var url = text(value, 500);
  if (!url) return "";
  if (!/^https:\/\/[^\s]+$/i.test(url)) return "";
  return url;
}

function slug(value, fallback) {
  var base = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return base || fallback;
}

function uniqueId(candidate, used) {
  var id = candidate;
  var n = 2;
  while (used.has(id)) {
    id = candidate + "-" + n;
    n += 1;
  }
  used.add(id);
  return id;
}

function sanitize(input) {
  if (!input || typeof input !== "object") throw new Error("Body must be a JSON object");
  if (!Array.isArray(input.events)) throw new Error("events must be an array");
  if (!Array.isArray(input.team)) throw new Error("team must be an array");
  if (input.events.length > 200) throw new Error("Too many events (max 200)");
  if (input.team.length > 100) throw new Error("Too many team members (max 100)");

  var usedEvents = new Set();
  var events = input.events.map(function (raw) {
    if (!raw || typeof raw !== "object") throw new Error("Each event must be an object");
    var title = text(raw.title, 120);
    if (!title) throw new Error("Every event needs a title");
    var date = text(raw.date, 40);
    if (!date || isNaN(Date.parse(date))) throw new Error("Event “" + title + "” has an invalid date");
    var tags = Array.isArray(raw.tags)
      ? raw.tags.filter(function (t) { return TAGS.indexOf(t) !== -1; })
      : [];
    if (!tags.length) tags = ["club"];
    return {
      id: uniqueId(slug(raw.id || title + "-" + date.slice(0, 10), "event"), usedEvents),
      title: title,
      date: date,
      displayDate: text(raw.displayDate, 120) || date,
      time: text(raw.time, 60),
      venue: text(raw.venue, 120),
      tags: tags,
      status: STATUSES.indexOf(raw.status) !== -1 ? raw.status : "open",
      statusLabel: text(raw.statusLabel, 60) || "Open",
      entry: text(raw.entry, 120),
      ticket: Math.min(Math.max(Math.round(Number(raw.ticket) || 0), 0), 100000),
      description: multiline(raw.description, 600),
      featured: !!raw.featured
    };
  });

  var usedTeam = new Set();
  var team = input.team.map(function (raw) {
    if (!raw || typeof raw !== "object") throw new Error("Each team member must be an object");
    var name = text(raw.name, 80);
    if (!name) throw new Error("Every team member needs a name");
    return {
      id: uniqueId(slug(raw.id || name, "member"), usedTeam),
      name: name,
      role: text(raw.role, 80),
      dept: text(raw.dept, 60) || "Crew",
      bio: multiline(raw.bio, 400),
      tags: Array.isArray(raw.tags)
        ? raw.tags.map(function (t) { return text(t, 24); }).filter(Boolean).slice(0, 6)
        : [],
      photo: safePhoto(raw.photo),
      featured: !!raw.featured
    };
  });

  return {
    updated: new Date().toISOString().slice(0, 10),
    note: "Maintained from /admin.html. Events drive the calendar; team drives the team page and the home preview.",
    events: events,
    team: team
  };
}

module.exports = { sanitize: sanitize };
