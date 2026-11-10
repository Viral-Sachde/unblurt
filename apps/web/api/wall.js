// The "unblurred lately" wall: before/after pairs that visitors chose to share from the Try it box.
// Nothing reaches the wall without a review.
//
// GET  /api/wall                         -> { items: [{ id, before, after, mode, at }] }   (approved, newest first)
// POST /api/wall  { before, after, mode } -> { ok: true }                                   (opt-in submit, goes to review)
//
// Review (needs header  Authorization: Bearer $WALL_ADMIN_TOKEN, see scripts/wall-review.mjs):
// GET  /api/wall?review=1                -> { items: [...pending] }
// POST /api/wall  { action: "approve" | "reject", id }

const crypto = require("node:crypto");
const { hasStore, redis, pipeline, allow, visitorHash, readBody, send, sameSite } = require("./_lib/store");

const PENDING = "unblurt:wall:pending"; // hash id -> json
const APPROVED = "unblurt:wall:approved"; // list of json, newest first
const SHOW = 12;
const MAX = 600;

function isAdmin(req) {
  const want = process.env.WALL_ADMIN_TOKEN || "";
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

module.exports = async (req, res) => {
  if (!hasStore) return req.method === "GET" ? send(res, 200, { items: [] }, "public, s-maxage=60") : send(res, 503, { error: "offline" });
  const admin = isAdmin(req);

  if (req.method === "GET") {
    if (req.query?.review === "1") {
      if (!admin) return send(res, 401, { error: "auth" });
      const flat = (await redis("HGETALL", PENDING)) || [];
      const items = [];
      for (let i = 0; i < flat.length; i += 2) items.push(parse(flat[i + 1]));
      return send(res, 200, { items: items.filter(Boolean).sort((a, b) => b.at - a.at) });
    }
    const list = (await redis("LRANGE", APPROVED, 0, SHOW - 1)) || [];
    return send(res, 200, { items: list.map(parse).filter(Boolean) }, "public, s-maxage=60, stale-while-revalidate=300");
  }

  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const body = readBody(req);

  if (body.action) {
    if (!admin) return send(res, 401, { error: "auth" });
    const id = String(body.id || "");
    const raw = await redis("HGET", PENDING, id);
    if (!raw) return send(res, 404, { error: "missing" });
    if (body.action === "approve") {
      await pipeline([["LPUSH", APPROVED, raw], ["LTRIM", APPROVED, 0, 99], ["HDEL", PENDING, id]]);
    } else {
      await redis("HDEL", PENDING, id);
    }
    return send(res, 200, { ok: true });
  }

  if (!sameSite(req)) return send(res, 403, { error: "origin" });
  const before = String(body.before || "").trim().slice(0, MAX);
  const after = String(body.after || "").trim().slice(0, MAX);
  if (!before || !after) return send(res, 400, { error: "empty" });
  if (!(await allow(`unblurt:rl:wall:${visitorHash(req)}`, 5, 3600))) return send(res, 429, { error: "slow" });
  const pendingCount = Number(await redis("HLEN", PENDING)) || 0;
  if (pendingCount > 500) return send(res, 429, { error: "busy" });

  const item = { id: crypto.randomUUID().slice(0, 8), before, after, mode: ["rephrase", "shorter", "fix"].includes(body.mode) ? body.mode : "rephrase", at: Date.now() };
  await redis("HSET", PENDING, item.id, JSON.stringify(item));
  return send(res, 200, { ok: true });
};
