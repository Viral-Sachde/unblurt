// GET /api/stats         -> { visitors, downloads }
// GET /api/stats?hit=1   -> counts this visit first (the site calls this once per browser session)
//
// visitors: a single counter in Upstash Redis (env KV_REST_API_URL / KV_REST_API_TOKEN, added by the
//           Vercel Upstash integration). Nothing about the visitor is stored: no IP, no cookie, no ID.
// downloads: the sum of download_count over every asset in every GitHub Release, cached for 10 minutes.

const REPO = "Viral-Sachde/unblurt";
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) return null;
  return (await r.json()).result ?? null;
}

async function githubDownloads() {
  let total = 0;
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "unblurt-site",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!r.ok) return null;
    const releases = await r.json();
    for (const rel of releases) for (const a of rel.assets || []) total += a.download_count || 0;
    if (releases.length < 100) break;
  }
  return total;
}

async function downloads() {
  const cached = await redis("GET", "unblurt:downloads").catch(() => null);
  if (cached != null) return Number(cached);
  const fresh = await githubDownloads().catch(() => null);
  if (fresh != null) await redis("SET", "unblurt:downloads", String(fresh), "EX", "600").catch(() => null);
  return fresh;
}

module.exports = async (req, res) => {
  const hit = req.query && req.query.hit === "1";
  const [visitors, dl] = await Promise.all([
    redis(hit ? "INCR" : "GET", "unblurt:visitors").catch(() => null),
    downloads(),
  ]);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Cache-Control", hit ? "no-store" : "public, s-maxage=60, stale-while-revalidate=600");
  res.status(200).send(JSON.stringify({ visitors: visitors == null ? null : Number(visitors), downloads: dl }));
};
