// GET /api/stats          -> { visitors, downloads, week }
// GET /api/stats?hit=1    -> counts this visit first (the site calls this once per browser session)
// GET /api/stats?u=1      -> counts one unblur (Try it demo or blurt of the day) toward this week's total,
//                            at most 30 per visitor per hour
//
// visitors: one running total. Nothing about the visitor is stored: no IP, no cookie, no ID.
// downloads: the sum of download_count over every asset in every GitHub Release, cached 10 minutes.
// week: messages unblurred this week on the site (Try it demo + blurt of the day).

const { redis, pipeline, weekKey, visitorHash, allow, send } = require("./_lib/store");

const REPO = "Viral-Sachde/unblurt";

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
  const cached = await redis("GET", "unblurt:downloads");
  if (cached != null) return Number(cached);
  const fresh = await githubDownloads().catch(() => null);
  if (fresh != null) await redis("SET", "unblurt:downloads", fresh, "EX", 600);
  return fresh;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const week = weekKey();
  const unblur = (q.u === "1" || q.daily === "1") && (await allow(`unblurt:rl:u:${visitorHash(req)}`, 30, 3600));
  const cmds = [
    [q.hit === "1" ? "INCR" : "GET", "unblurt:visitors"],
    [unblur ? "INCR" : "GET", week],
  ];
  if (unblur) cmds.push(["EXPIRE", week, 60 * 60 * 24 * 21]);
  const [[visitors, weekCount], dl] = await Promise.all([pipeline(cmds), downloads()]);
  const num = (v) => (v == null ? null : Number(v));
  const counted = q.hit === "1" || q.u === "1" || q.daily === "1";
  send(res, 200, { visitors: num(visitors), downloads: dl, week: num(weekCount) ?? (visitors == null ? null : 0) },
    counted ? "no-store" : "public, s-maxage=60, stale-while-revalidate=600");
};
