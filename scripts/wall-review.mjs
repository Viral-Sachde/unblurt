#!/usr/bin/env node
// Review submissions for the "unblurred lately" wall on unblurt.me.
//
//   node scripts/wall-review.mjs              list what's waiting
//   node scripts/wall-review.mjs approve ID   put it on the wall
//   node scripts/wall-review.mjs reject ID    drop it
//
// Reads WALL_ADMIN_TOKEN from the environment or from apps/web/.env.local (git-ignored).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITE = process.env.SITE || "https://unblurt.me";
let token = process.env.WALL_ADMIN_TOKEN;
if (!token) {
  try {
    const env = readFileSync(fileURLToPath(new URL("../apps/web/.env.local", import.meta.url)), "utf8");
    token = env.match(/^WALL_ADMIN_TOKEN="?([^"\n]+)"?/m)?.[1];
  } catch {}
}
if (!token) {
  console.error("No WALL_ADMIN_TOKEN. Add it to apps/web/.env.local or the environment.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const [action, id] = process.argv.slice(2);

if (!action) {
  const r = await fetch(`${SITE}/api/wall?review=1`, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { items } = await r.json();
  if (!items.length) console.log("Nothing waiting.");
  for (const it of items) {
    console.log(`\n${it.id}  ${it.mode}  ${new Date(it.at).toLocaleString()}`);
    console.log(`  before: ${it.before}`);
    console.log(`  after:  ${it.after}`);
  }
} else if ((action === "approve" || action === "reject") && id) {
  const r = await fetch(`${SITE}/api/wall`, { method: "POST", headers, body: JSON.stringify({ action, id }) });
  console.log(r.ok ? `${action}d ${id}` : `failed: HTTP ${r.status}`);
} else {
  console.log("usage: wall-review.mjs [approve|reject ID]");
}
