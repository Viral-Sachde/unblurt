#!/usr/bin/env node
// Sets the app version everywhere it lives, so they never drift:
//   apps/desktop/package.json, apps/desktop/src-tauri/tauri.conf.json, apps/desktop/src-tauri/Cargo.toml
// Usage: node scripts/set-version.mjs 0.2.0   (or: npm run version:set -- 0.2.0 in apps/desktop)
// Then add a "## [0.2.0]" section to CHANGELOG.md, commit, and tag v0.2.0 (see README "Releasing").
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v ?? "")) {
  console.error("usage: set-version.mjs <x.y.z>");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desk = join(root, "apps/desktop");

for (const f of [join(desk, "package.json"), join(desk, "src-tauri/tauri.conf.json")]) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.version = v;
  writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
}
const lock = join(desk, "package-lock.json");
const l = JSON.parse(readFileSync(lock, "utf8"));
l.version = v;
if (l.packages?.[""]) l.packages[""].version = v;
writeFileSync(lock, JSON.stringify(l, null, 2) + "\n");

const cargo = join(desk, "src-tauri/Cargo.toml");
const c = readFileSync(cargo, "utf8").replace(/^(\[package\][\s\S]*?\nversion = )"[^"]*"/m, `$1"${v}"`);
writeFileSync(cargo, c);
console.log(`version set to ${v}. Cargo.lock updates on the next cargo build.`);
