// Cloudflare Worker entry: serves the static site and runs the same /api/*
// handlers the Vercel deployment uses. The handlers are Node-style
// (req, res) functions, so this file adapts a fetch Request/Response to them
// instead of rewriting the API.
import contentHandler from "../api/content.js";
import ordersHandler from "../api/orders.js";
import applicationsHandler from "../api/applications.js";
import loginHandler from "../api/login.js";
import logoutHandler from "../api/logout.js";
import sessionHandler from "../api/session.js";
import setupHandler from "../api/setup.js";

const HANDLERS = {
  content: contentHandler,
  orders: ordersHandler,
  applications: applicationsHandler,
  login: loginHandler,
  logout: logoutHandler,
  session: sessionHandler,
  setup: setupHandler
};

/* The API modules read process.env at call time. */
function applyEnv(env) {
  if (!globalThis.process) globalThis.process = { env: {} };
  if (!globalThis.process.env) globalThis.process.env = {};
  const target = globalThis.process.env;
  ["SESSION_SECRET", "GITHUB_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH"].forEach(function (key) {
    if (typeof env[key] === "string" && env[key]) target[key] = env[key];
  });
}

function makeRequest(request, body) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach(function (value, key) {
    headers[key.toLowerCase()] = value;
  });
  headers["x-forwarded-proto"] = url.protocol.replace(":", "");
  // The handlers read the body as a stream (readJson listens for data/end), and
  // some of them await other work before they subscribe. The body is already in
  // memory here, so remember it and replay it to whoever subscribes, whenever
  // they subscribe.
  const listeners = { data: [], end: [], error: [] };
  let delivered = false;
  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers: headers,
    socket: { remoteAddress: request.headers.get("cf-connecting-ip") || "" },
    on: function (event, handler) {
      if (delivered && event === "data") {
        queueMicrotask(function () { if (body && body.length) handler(body); });
      } else if (delivered && event === "end") {
        queueMicrotask(function () { handler(); });
      } else {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }
      return req;
    },
    destroy: function () {},
    once: function (event, handler) { return req.on(event, handler); }
  };
  queueMicrotask(function () {
    delivered = true;
    if (body && body.length) {
      listeners.data.forEach(function (handler) { handler(body); });
    }
    listeners.end.forEach(function (handler) { handler(); });
    listeners.data = [];
    listeners.end = [];
  });
  return req;
}

function makeResponse() {
  const headers = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: function (key, value) { headers[String(key).toLowerCase()] = value; },
    getHeader: function (key) { return headers[String(key).toLowerCase()]; },
    removeHeader: function (key) { delete headers[String(key).toLowerCase()]; },
    writeHead: function (status, extra) {
      res.statusCode = status;
      if (extra) Object.keys(extra).forEach(function (key) { res.setHeader(key, extra[key]); });
    },
    end: function (payload) {
      res.headersSent = true;
      res._body = payload === undefined || payload === null ? "" : payload;
    },
    write: function (chunk) { res._body = (res._body || "") + chunk; },
    _headers: headers
  };
  return res;
}

async function handleApi(request, handler) {
  const body = request.method === "GET" || request.method === "HEAD"
    ? null
    : new Uint8Array(await request.arrayBuffer());
  const req = makeRequest(request, body);
  const res = makeResponse();
  try {
    await handler(req, res);
  } catch (err) {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
  const out = new Headers();
  Object.keys(res._headers).forEach(function (key) {
    out.set(key, String(res._headers[key]));
  });
  const payload = res._body == null ? "" : res._body;
  return new Response(res.statusCode === 204 || res.statusCode === 304 ? null : payload, {
    status: res.statusCode,
    headers: out
  });
}

export default {
  async fetch(request, env) {
    applyEnv(env);
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const name = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
      const handler = HANDLERS[name];
      if (!handler) return Response.json({ error: "Not found" }, { status: 404 });
      return handleApi(request, handler);
    }

    // The asset layer serves pages at their extensionless URL and redirects
    // /page.html to /page. The site links to .html everywhere, so translate
    // those requests internally instead of making every click take a detour.
    if (url.pathname.endsWith(".html")) {
      const clean = new URL(request.url);
      clean.pathname = url.pathname === "/index.html" ? "/" : url.pathname.slice(0, -5);
      const page = await env.ASSETS.fetch(new Request(clean.toString(), request));
      return new Response(page.body, { status: page.status, headers: page.headers });
    }

    // Keep the private data files out of reach, exactly like the dev server does.
    if (/^\/assets\/data\/(admin|orders|applications)\.json$/.test(url.pathname)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
