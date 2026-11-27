"use strict";

var auth = require("./_auth");
var store = require("./_store");

var ACCOUNT_PATH = "assets/data/admin.json";

function empty() {
  return { configured: false, username: "", hash: "", created: "" };
}

async function readAccount() {
  var read = await store.readText(ACCOUNT_PATH);
  if (!read.text) return empty();

  var doc = null;
  try {
    doc = JSON.parse(read.text);
  } catch (err) {
    doc = null;
  }
  if (!doc || typeof doc.username !== "string" || typeof doc.hash !== "string" || !doc.hash) {
    return empty();
  }
  return {
    configured: true,
    username: doc.username.slice(0, 80),
    hash: doc.hash,
    created: typeof doc.created === "string" ? doc.created : ""
  };
}

/* Creates the one account. Throws "ALREADY_CONFIGURED" if one exists. */
async function createAccount(username, password) {
  var existing = await readAccount();
  if (existing.configured) {
    var err = new Error("An owner account already exists.");
    err.code = "ALREADY_CONFIGURED";
    throw err;
  }

  var doc = {
    username: username,
    hash: auth.hashPassword(password),
    created: new Date().toISOString(),
    note: "Owner account for /admin.html. Delete this file to allow setup again."
  };

  await store.writeText(
    ACCOUNT_PATH,
    JSON.stringify(doc, null, 2) + "\n",
    "Create the owner admin account"
  );

  return { configured: true, username: doc.username };
}

module.exports = {
  ACCOUNT_PATH: ACCOUNT_PATH,
  readAccount: readAccount,
  createAccount: createAccount
};
