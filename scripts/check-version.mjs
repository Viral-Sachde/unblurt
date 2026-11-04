#!/usr/bin/env node
// Fails if the version files disagree, or (with a tag argument like v0.1.0) don't match the tag.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desk = join(dirname(fileURLToPath(import.meta.url)), "../apps/desktop");
const pkg = JSON.parse(readFileSync(join(desk, "package.json"), "utf8")).version;
const conf = JSON.parse(readFileSync(join(desk, "src-tauri/tauri.conf.json"), "utf8")).version;
const cargo = readFileSync(join(desk, "src-tauri/Cargo.toml"), "utf8").match(/^\[package\][\s\S]*?\nversion = "([^"]*)"/m)?.[1];
const changelog = readFileSync(join(desk, "../../CHANGELOG.md"), "utf8");

const errors = [];
if (pkg !== conf || pkg !== cargo) errors.push(`versions disagree: package.json ${pkg}, tauri.conf.json ${conf}, Cargo.toml ${cargo}`);
if (!changelog.includes(`## [${pkg}]`)) errors.push(`CHANGELOG.md has no "## [${pkg}]" section`);
const tag = process.argv[2];
if (tag && tag !== `v${pkg}`) errors.push(`tag ${tag} doesn't match version ${pkg}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`version ${pkg} ok`);
