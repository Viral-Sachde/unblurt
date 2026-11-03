// Generates the isometric keycap illustration. Usage: node brand/illustrations.mjs apps/web/assets
//
// Every block is a rounded rectangle extruded straight up. The visible side walls are traced
// from the same rounded outline as the top face, so tops and walls always line up (no corners
// poking out past the walls). The whole drawing is measured and centred in the canvas.

const W = 1200, H = 720;
const C = {
  teal: "#0F6B6A", tealMid: "#3F8F8B", tealLight: "#8CC4BE",
  pers: "#FF7A45", persDeep: "#E25F2A", persTop: "#FFB08C",
  stone: "#EDE6DD", stoneDeep: "#DDD3C6", stoneSide: "#E6DCCF", cream: "#FBF8F4", ink: "#101010",
};
const f = (n) => +n.toFixed(2);

// Isometric projection: u runs down-right along the row, v runs up-right across it, z is up.
const P = (u, v, z) => [0.866 * (u + v), 0.5 * (u - v) - z];

// Outline of a rounded rect in the ground plane, with the outward normal at each sample.
function outline(u, v, w, h, r, steps = 10) {
  const pts = [];
  const corners = [
    [u + w - r, v + r, -90], // (umax, vmin)
    [u + w - r, v + h - r, 0], // (umax, vmax)
    [u + r, v + h - r, 90], // (umin, vmax)
    [u + r, v + r, 180], // (umin, vmin)
  ];
  for (const [cu, cv, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = ((a0 + (90 * i) / steps) * Math.PI) / 180;
      const nu = Math.cos(a), nv = Math.sin(a);
      pts.push({ u: cu + r * nu, v: cv + r * nv, nu, nv });
    }
  }
  return pts;
}

const poly = (pts, fill) => `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z" fill="${fill}"/>`;

// A block: footprint (u, v, w, h) with corner radius r, from height z0 up by t.
function block({ u, v, w, h, r, z0 = 0, t, top, left, front }) {
  const ring = outline(u, v, w, h, r);
  const n = ring.length;
  // A wall faces the viewer when its normal points down the screen (nu > nv).
  // Walls that face mostly -v are the left wall; mostly +u, the front wall.
  const side = (p) => (p.nu - p.nv <= 1e-6 ? null : -p.nv > p.nu ? "left" : "front");
  const out = [];
  for (const which of ["left", "front"]) {
    // collect the contiguous run of samples for this wall (the ring may wrap around)
    let start = ring.findIndex((p, i) => side(p) === which && side(ring[(i - 1 + n) % n]) !== which);
    if (start < 0) continue;
    const run = [];
    for (let i = start; side(ring[i % n]) === which && run.length < n; i++) run.push(ring[i % n]);
    // extend one sample into the neighbour so the two walls meet without a hairline gap
    run.push(ring[(start + run.length) % n]);
    const bottom = run.map((p) => P(p.u, p.v, z0));
    const upper = run.map((p) => P(p.u, p.v, z0 + t)).reverse();
    out.push(poly([...bottom, ...upper], which === "left" ? left : front));
  }
  out.push(poly(ring.map((p) => P(p.u, p.v, z0 + t)), top));
  return { svg: out.join("\n"), pts: ring.flatMap((p) => [P(p.u, p.v, z0), P(p.u, p.v, z0 + t)]) };
}

// Text lying on a top face: x runs along u, y runs along -v (so glyphs read normally).
const label = (u, v, z) => {
  const [x, y] = P(u, v, z);
  return `matrix(0.866 0.5 -0.866 0.5 ${f(x)} ${f(y)})`;
};

function keys() {
  const parts = [];
  const pts = [];
  const add = (b) => (parts.push(b.svg), pts.push(...b.pts));

  // base plate
  add(block({ u: -30, v: -96, w: 856, h: 192, r: 30, t: 20, top: C.cream, left: C.stoneDeep, front: C.stoneSide }));

  const caps = [
    { u: 0, w: 150, t: 54, top: C.tealLight, left: C.teal, front: C.tealMid, glyph: "⌘", size: 64 },
    { u: 172, w: 150, t: 54, top: C.persTop, left: C.persDeep, front: C.pers, glyph: "⇧", size: 64 },
    { u: 344, w: 452, t: 40, top: "#FFFFFF", left: C.stoneDeep, front: "#E8DFD4", glyph: "space", size: 40 },
  ];
  const text = [];
  for (const c of caps) {
    add(block({ u: c.u, v: -70, w: c.w, h: 140, r: 22, z0: 20, t: c.t, top: c.top, left: c.left, front: c.front }));
    // centre the glyph on the cap's top face
    const z = 20 + c.t;
    const cu = c.u + c.w / 2;
    text.push(
      `<text transform="${label(cu, 0, z)}" text-anchor="middle" dominant-baseline="central" font-family="Inter, -apple-system, Helvetica, Arial, sans-serif" font-weight="500" font-size="${c.size}" fill="${C.ink}">${c.glyph}</text>`,
    );
  }

  // two motion ticks above the command key
  const [kx, ky] = P(75, 0, 74);
  const ticks = `<path d="M ${f(kx + 34)} ${f(ky - 92)} l 16 -34 M ${f(kx + 78)} ${f(ky - 74)} l 26 -26" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>`;
  pts.push([kx + 34, ky - 126], [kx + 104, ky - 100]);

  // centre everything in the canvas
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = (Math.min(...xs) + Math.max(...xs)) / 2, by = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dx = f(W / 2 - bx), dy = f(H / 2 - by + 6);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Oversized keycaps: command, shift and space">`,
    `<defs><pattern id="kdots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${C.ink}" opacity=".12"/></pattern></defs>`,
    `<rect width="${W}" height="${H}" fill="${C.stone}"/><rect width="${W}" height="${H}" fill="url(#kdots)"/>`,
    `<g transform="translate(${dx} ${dy})">`,
    ...parts,
    ...text,
    ticks,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

import { writeFileSync } from "node:fs";
const dir = process.argv[2];
writeFileSync(`${dir}/keys.svg`, keys());
