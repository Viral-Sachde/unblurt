// Generates the isometric marketing illustrations. Usage: node brand/illustrations.mjs apps/web/assets
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

function hero() {
  const O = [40, 30];
  const L = 1080, half = 92, rail = 38, rh = 26, slab = 20;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img" aria-label="A tangled ball of thought rolls down a lane and comes out as a neat stack of written cards">`);
  out.push(`<defs><pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${C.ink}" opacity=".13"/></pattern>
<clipPath id="ballclip"><circle cx="0" cy="0" r="86"/></clipPath></defs>`);
  out.push(`<rect width="1200" height="720" fill="${C.stone}"/>`);
  // slab under everything
  out.push(`<rect transform="${faceV(O, -half - rail)}" x="0" y="${-slab}" width="${L}" height="${slab}" fill="${C.tealMid}"/>`);
  out.push(`<rect transform="${faceU(O, L)}" x="${-half - rail}" y="${-slab}" width="${2 * (half + rail)}" height="${slab}" fill="${C.teal}"/>`);
  // lane
  out.push(`<rect transform="${ground(O)}" x="0" y="${-half}" width="${L}" height="${2 * half}" fill="${C.persTint}"/>`);
  out.push(`<rect transform="${ground(O)}" x="0" y="${-half}" width="${L}" height="${2 * half}" fill="url(#dots)"/>`);
  // far rail (upper right): inner face then top
  out.push(`<rect transform="${faceV(O, half)}" x="0" y="0" width="${L}" height="${rh}" fill="${C.tealMid}"/>`);
  out.push(`<rect transform="${ground(O, rh)}" x="0" y="${half}" width="${L}" height="${rail}" fill="${C.tealLight}"/>`);
  out.push(`<rect transform="${faceU(O, L)}" x="${half}" y="0" width="${rail}" height="${rh}" fill="${C.teal}"/>`);

  // the thread: tangled near the ball, straight down the lane
  out.push(`<path transform="${ground(O)}" vector-effect="non-scaling-stroke" d="M 250 -10 C 300 70, 330 -70, 380 0 S 450 40, 470 -10 S 540 10, 570 0 L 760 0" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>`);

  // ball of tangled thought
  const bx = O[0] + D[0] * 215 + E[0] * 10, by = O[1] + D[1] * 215 + E[1] * 10 - 72;
  out.push(`<g transform="translate(${f(bx)} ${f(by)})">
<circle cx="-14" cy="12" r="86" fill="${C.persDeep}"/>
<circle r="86" fill="${C.pers}"/>
<g clip-path="url(#ballclip)" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round">
<path d="M-70 -20 C -30 -90, 60 -70, 50 -10 S -40 50, -20 0 S 70 -40, 75 30 S -10 90, -50 40"/>
<path d="M-40 -70 C 10 -40, -60 20, 10 30 S 60 80, 20 90" opacity=".8"/>
</g>
<path d="M-50 -58 A 70 70 0 0 1 -18 -76" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>
</g>`);

  // neat stack of cards at the end of the lane
  const cardU = 770, cardW = 170, cardV = -70, cardH = 140, th = 9;
  for (let i = 0; i < 3; i++) {
    const shift = i === 1 ? 8 : i === 2 ? -4 : 0;
    out.push(box(O, { u: cardU + shift, v: cardV, w: cardW, h: cardH, z0: i * (th + 3), t: th, top: C.cream, left: C.stoneDeep, front: "#E8DFD4", rx: 6 }));
  }
  const zTop = 2 * (th + 3) + th;
  const lines = [[46, 120], [22, 140], [-2, 110], [-26, 90]];
  for (const [v, len] of lines) out.push(`<rect transform="${ground(O, zTop)}" x="${cardU - 4 + 22}" y="${v - 4}" width="${len}" height="9" rx="4.5" fill="${C.teal}"/>`);
  out.push(`<rect transform="${ground(O, zTop)}" x="${cardU - 4 + 22 + 98}" y="${-30 - 2}" width="10" height="13" rx="2" fill="${C.pers}"/>`);

  // near rail (lower left): outer face then top — drawn last so it sits in front
  out.push(`<rect transform="${faceV(O, -half - rail)}" x="0" y="0" width="${L}" height="${rh}" fill="${C.tealMid}"/>`);
  out.push(`<rect transform="${ground(O, rh)}" x="0" y="${-half - rail}" width="${L}" height="${rail}" fill="${C.tealLight}"/>`);
  out.push(`<rect transform="${faceU(O, L)}" x="${-half - rail}" y="0" width="${rail}" height="${rh}" fill="${C.teal}"/>`);
  out.push(`<rect transform="${faceU(O, L)}" x="${-half}" y="${-slab}" width="${2 * half}" height="${slab}" fill="${C.persSide}"/>`);
  out.push(`</svg>`);
  return out.join("\n");
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
  out.push(`<circle cx="${f(O[0] + D[0] * 800 + 40)}" cy="${f(O[1] + D[1] * 800 - 140)}" r="26" fill="${C.pers}"/>`);
  out.push(`</svg>`);
  return out.join("\n");
}

import { writeFileSync } from "node:fs";
const dir = process.argv[2];
writeFileSync(`${dir}/lane.svg`, hero());
writeFileSync(`${dir}/keys.svg`, keys());
