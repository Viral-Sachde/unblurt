// Generates the isometric keycap illustration. Usage: node brand/illustrations.mjs apps/web/assets
// Isometric helpers: ground plane (u along lane, v across), z up.
const D = [0.866, 0.5], E = [0.866, -0.5];
const f = (n) => +n.toFixed(2);
const ground = (O, z = 0) => `matrix(${D[0]} ${D[1]} ${E[0]} ${E[1]} ${f(O[0])} ${f(O[1] - z)})`;
// vertical face at fixed v, spanning u (x) and z (y up)
const faceV = (O, v) => `matrix(${D[0]} ${D[1]} 0 -1 ${f(O[0] + E[0] * v)} ${f(O[1] + E[1] * v)})`;
// vertical face at fixed u, spanning v (x) and z
const faceU = (O, u) => `matrix(${E[0]} ${E[1]} 0 -1 ${f(O[0] + D[0] * u)} ${f(O[1] + D[1] * u)})`;

const C = {
  teal: "#0F6B6A", tealMid: "#3F8F8B", tealLight: "#8CC4BE", tealPale: "#CFE5E1",
  pers: "#FF7A45", persDeep: "#E25F2A", persTint: "#FFD7C4", persSide: "#F4B89C",
  stone: "#EDE6DD", stoneDeep: "#DDD3C6", cream: "#FBF8F4", ink: "#101010",
};

// A box resting at z0 with footprint u∈[u,u+w], v∈[v,v+h], height t.
function box(O, { u, v, w, h, z0 = 0, t, top, left, front, rx = 0 }) {
  return [
    `<rect transform="${faceV(O, v)}" x="${u}" y="${z0}" width="${w}" height="${t}" fill="${left}"/>`,
    `<rect transform="${faceU(O, u + w)}" x="${v}" y="${z0}" width="${h}" height="${t}" fill="${front}"/>`,
    `<rect transform="${ground(O, z0 + t)}" x="${u}" y="${v}" width="${w}" height="${h}" rx="${rx}" fill="${top}"/>`,
  ].join("\n");
}

function keys() {
  const O = [250, 190];
  // text on a top face: x along the lane, y down-left (keeps glyphs unmirrored)
  const label = (u, v, z) => `matrix(0.866 0.5 -0.866 0.5 ${f(O[0] + D[0] * u + E[0] * v)} ${f(O[1] + D[1] * u + E[1] * v - z)})`;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img" aria-label="Oversized keycaps: command, shift and space">`,
  `<defs><pattern id="kdots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${C.ink}" opacity=".12"/></pattern></defs>`,
  `<rect width="1200" height="720" fill="${C.stone}"/><rect width="1200" height="720" fill="url(#kdots)"/>`];
  out.push(box(O, { u: -34, v: -104, w: 868, h: 208, t: 20, top: C.cream, left: C.stoneDeep, front: "#E3D9CC", rx: 28 }));
  const caps = [
    { u: 0, w: 150, t: 54, top: C.tealLight, left: C.teal, front: C.tealMid, glyph: "⌘" },
    { u: 172, w: 150, t: 54, top: "#FFB08C", left: C.persDeep, front: C.pers, glyph: "⇧" },
    { u: 344, w: 456, t: 40, top: "#FFFFFF", left: C.stoneDeep, front: "#E8DFD4", glyph: "space" },
  ];
  for (const c of caps) {
    out.push(box(O, { u: c.u, v: -72, w: c.w, h: 144, z0: 20, t: c.t, top: c.top, left: c.left, front: c.front, rx: 20 }));
    const big = c.glyph.length === 1;
    out.push(`<text transform="${label(c.u + (big ? 52 : 40), big ? 28 : 40, 20 + c.t)}" font-family="Inter, -apple-system, Helvetica, Arial, sans-serif" font-weight="${big ? 500 : 500}" font-size="${big ? 64 : 38}" fill="${C.ink}">${c.glyph}</text>`);
  }
  const cx = O[0] + D[0] * 75, cy = O[1] + D[1] * 75 - 74;
  out.push(`<path d="M ${f(cx + 40)} ${f(cy - 70)} l 18 -36 M ${f(cx + 82)} ${f(cy - 52)} l 28 -28" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>`);
  out.push(`</svg>`);
  return out.join("\n");
}

import { writeFileSync } from "node:fs";
const dir = process.argv[2];
writeFileSync(`${dir}/keys.svg`, keys());
