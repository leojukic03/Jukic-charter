// Sea routing on land/sea rasters built from OpenStreetMap coastlines.
// A* over 8-connected cells with a near-shore penalty, then line-of-sight smoothing
// that never cuts closer to shore than the A* path itself did.
'use strict';

const grids = {}; // name -> { meta, sea: Uint8Array, clr: Uint8Array }
let stampGen = 0;
let work = null; // shared scratch for the largest grid

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'grid') {
      grids[m.name] = prepare(m.meta, new Uint8Array(m.sea));
      self.postMessage({ id: m.id, ok: true });
    } else if (m.type === 'route') {
      self.postMessage({ id: m.id, ok: true, result: routeMulti(m.points) });
    }
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });
  }
};

function prepare(meta, sea) {
  const { cols: w, rows: h } = meta;
  // Chamfer distance to land, in thirds of a cell (3 = 1 cell), capped.
  const d = new Uint16Array(w * h);
  const INF = 60000;
  for (let i = 0; i < d.length; i++) d[i] = sea[i] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) {
      v = Math.min(v, d[i - w] + 3);
      if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i]; if (!v) continue;
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + 3);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
      if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
    }
    d[i] = v;
  }
  // Clearance in whole cells, capped at 8 (enough for the penalty and smoothing).
  const clr = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) clr[i] = Math.min(8, Math.floor(d[i] / 3));
  const n = w * h;
  if (!work || work.n < n) work = { n, g: new Float32Array(n), stamp: new Int32Array(n), parent: new Int32Array(n), closed: new Int32Array(n) };
  return { meta, sea, clr };
}

const inBox = (g, lat, lon, marginCells = 0) => {
  const m = g.meta;
  const mLat = m.dLat * marginCells, mLon = m.dLon * marginCells;
  return lat > m.south + mLat && lat < m.north - mLat && lon > m.west + mLon && lon < m.east - mLon;
};
const toCell = (g, lat, lon) => [Math.floor((lon - g.meta.west) / g.meta.dLon), Math.floor((g.meta.north - lat) / g.meta.dLat)];
const toLatLon = (g, x, y) => [g.meta.west + (x + 0.5) * g.meta.dLon, g.meta.north - (y + 0.5) * g.meta.dLat]; // [lon, lat]

// Nearest sea cell, preferring some clearance from the shore.
function snap(g, lat, lon, maxR) {
  const { cols: w, rows: h } = g.meta;
  let [x0, y0] = toCell(g, lat, lon);
  x0 = Math.max(0, Math.min(w - 1, x0)); y0 = Math.max(0, Math.min(h - 1, y0));
  for (const need of [2, 1]) {
    let best = -1, bestD = Infinity;
    for (let r = 0; r <= maxR; r++) {
      if (best >= 0 && r * r > bestD) break;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (g.sea[i] && g.clr[i] >= need) { const dd = dx * dx + dy * dy; if (dd < bestD) { bestD = dd; best = i; } }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// Binary min-heap on parallel arrays.
class Heap {
  constructor() { this.k = new Float64Array(1 << 16); this.v = new Int32Array(1 << 16); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k = new Float64Array(this.n * 2); k.set(this.k); this.k = k; const v = new Int32Array(this.n * 2); v.set(this.v); this.v = v; }
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  }
}

const PEN = [6, 3, 1.6, 1.2, 1, 1, 1, 1, 1]; // cost multiplier by clearance (cells)
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

function astar(g, s, t) {
  const { cols: w, rows: h } = g.meta;
  const { g: gs, stamp, parent, closed } = work;
  const cur = ++stampGen;
  const tx = t % w, ty = (t / w) | 0;
  const heur = (i) => { const dx = Math.abs(i % w - tx), dy = Math.abs(((i / w) | 0) - ty); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const heap = new Heap();
  stamp[s] = cur; gs[s] = 0; parent[s] = -1; heap.push(heur(s), s);
  let expanded = 0;
  while (heap.n) {
    const i = heap.pop();
    if (closed[i] === cur) continue;
    closed[i] = cur;
    if (i === t) break;
    if (++expanded > 6e6) return null;
    const x = i % w, y = (i / w) | 0, gi = gs[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!g.sea[j] || closed[j] === cur) continue;
      if (k >= 4 && (!g.sea[y * w + nx] || !g.sea[ny * w + x])) continue; // no corner cutting
      const ng = gi + STEP[k] * PEN[g.clr[j]];
      if (stamp[j] !== cur || ng < gs[j]) { stamp[j] = cur; gs[j] = ng; parent[j] = i; heap.push(ng + heur(j), j); }
    }
  }
  if (closed[t] !== cur) return null;
  const path = [];
  for (let i = t; i !== -1; i = parent[i]) path.push(i);
  return path.reverse();
}

// Line of sight between two cells: every cell sea with clearance >= need, no diagonal corner cuts.
function los(g, a, b, need) {
  const w = g.meta.cols;
  let x0 = a % w, y0 = (a / w) | 0; const x1 = b % w, y1 = (b / w) | 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const i = y0 * w + x0;
    if (!g.sea[i] || g.clr[i] < need) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err; let mx = false, my = false;
    if (e2 >= dy) { err += dy; x0 += sx; mx = true; }
    if (e2 <= dx) { err += dx; y0 += sy; my = true; }
    if (mx && my && (!g.sea[y0 * w + (x0 - sx)] || !g.sea[(y0 - sy) * w + x0])) return false;
  }
}

function smooth(g, path) {
  if (path.length < 3) return path.slice();
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let k = i + 1, minC = Math.min(g.clr[path[i]], g.clr[path[k]]), lastOk = k;
    for (k = i + 2; k < path.length; k++) {
      minC = Math.min(minC, g.clr[path[k]]);
      if (los(g, path[i], path[k], Math.min(minC, 3))) lastOk = k;
      else if (k - lastOk > 40) break; // give up looking far past the last visible cell
    }
    out.push(path[lastOk]);
    i = lastOk;
  }
  return out;
}

function routeOn(g, a, b) {
  const R = g.meta.cellMeters <= 100 ? 75 : 12;
  const s = snap(g, a[1], a[0], R), t = snap(g, b[1], b[0], R);
  if (s < 0 || t < 0) return null;
  const p = astar(g, s, t);
  if (!p) return null;
  const w = g.meta.cols;
  return smooth(g, p).map((i) => toLatLon(g, i % w, (i / w) | 0));
}

// a, b: [lon, lat]
function routeLeg(a, b) {
  const fine = grids.fine, coarse = grids.coarse;
  const aIn = fine && inBox(fine, a[1], a[0], 3), bIn = fine && inBox(fine, b[1], b[0], 3);
  let coords = null, approx = false, isCoarse = false;
  if (aIn && bIn) coords = routeOn(fine, a, b);
  if (!coords && coarse && inBox(coarse, a[1], a[0]) && inBox(coarse, b[1], b[0])) {
    const c = routeOn(coarse, a, b);
    if (c) {
      coords = c; isCoarse = true;
      // Re-route the parts inside the detailed area on the fine grid for narrow passages.
      if (fine && (aIn || bIn)) {
        const inside = (p) => inBox(fine, p[1], p[0], 30);
        if (aIn) {
          let k = 0; while (k < coords.length - 1 && inside(coords[k + 1])) k++;
          if (k > 0) { const f = routeOn(fine, a, coords[k]); if (f) coords = f.concat(coords.slice(k + 1)); }
        }
        if (bIn) {
          let k = coords.length - 1; while (k > 0 && inside(coords[k - 1])) k--;
          if (k < coords.length - 1) { const f = routeOn(fine, coords[k], b); if (f) coords = coords.slice(0, k).concat(f); }
        }
      }
    }
  }
  if (!coords) { coords = [a, b]; approx = true; }
  // Tie the route to the exact requested endpoints.
  coords = [a].concat(coords, [b]);
  return { coords, nm: lengthNm(coords), approx, coarse: isCoarse };
}

function routeMulti(points) {
  const legs = [];
  for (let i = 0; i < points.length - 1; i++) legs.push(routeLeg(points[i], points[i + 1]));
  return { legs, nm: legs.reduce((s, l) => s + l.nm, 0) };
}

function lengthNm(c) {
  let m = 0;
  for (let i = 1; i < c.length; i++) m += hav(c[i - 1], c[i]);
  return m / 1852;
}
function hav(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
