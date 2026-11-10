// Shared helpers for the site's functions. Files under api/_lib are not routes.
//
// Storage is Upstash Redis over its REST API (env KV_REST_API_URL / KV_REST_API_TOKEN, added by
// the Vercel Upstash integration). Every helper returns null when Redis isn't configured, so the
// site keeps working and the features that need storage just stay hidden.

const crypto = require("node:crypto");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasStore = Boolean(URL_ && TOKEN);

async function redis(...cmd) {
  if (!hasStore) return null;
  try {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd.map(String)),
    });
    if (!r.ok) return null;
    return (await r.json()).result ?? null;
  } catch {
    return null;
  }
}

// Several commands in one round trip. Returns an array of results (or nulls).
async function pipeline(cmds) {
  if (!hasStore) return cmds.map(() => null);
  try {
    const r = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
    });
    if (!r.ok) return cmds.map(() => null);
    return (await r.json()).map((x) => (x && "result" in x ? x.result : null));
  } catch {
    return cmds.map(() => null);
  }
}

// ISO week key like 2026-W46, so "this week" resets every Monday (UTC).
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `unblurt:week:${y}-W${String(w).padStart(2, "0")}`;
}

// A one-way, day-scoped fingerprint used only for rate limiting. The raw IP is never stored.
function visitorHash(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${ip}|${day}|${process.env.RATE_SALT || "unblurt"}`).digest("hex").slice(0, 24);
}

// Fixed-window limiter. Returns true when the call is allowed.
async function allow(key, limit, windowSec) {
  const [n] = await pipeline([["INCR", key], ["EXPIRE", key, windowSec, "NX"]]);
  if (n == null) return false;
  return Number(n) <= limit;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

function send(res, status, data, cache = "no-store") {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(status).send(JSON.stringify(data));
}

// Same-site check for POSTs, so other sites can't post to the wall from their pages.
function sameSite(req) {
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin) return true; // curl and older browsers; rate limits still apply
  try {
    const host = new URL(origin).hostname;
    // this site, plus the URL of the deployment serving this request (the host's own system env)
    const own = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean);
    return host === "unblurt.me" || host === "www.unblurt.me" || own.includes(host) || host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

module.exports = { hasStore, redis, pipeline, weekKey, visitorHash, allow, readBody, send, sameSite };
