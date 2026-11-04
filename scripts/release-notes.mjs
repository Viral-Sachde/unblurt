#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version (used as the GitHub Release notes).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const v = (process.argv[2] ?? "").replace(/^v/, "");
const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../CHANGELOG.md"), "utf8");
const start = text.indexOf(`## [${v}]`);
if (start < 0) {
  console.error(`no CHANGELOG section for ${v}`);
  process.exit(1);
}
const rest = text.slice(start);
const next = rest.indexOf("\n## [", 1);
const body = (next < 0 ? rest : rest.slice(0, next)).split("\n").slice(1).join("\n").trim();
process.stdout.write(body + "\n");
