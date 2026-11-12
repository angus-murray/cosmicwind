/**
 * 3D frame analysis by the direct stiffness method: linear static, second-order (P-Δ) static, tension-only and
 * compression-only members, elastic critical buckling and natural frequencies.
 * Internal units: kN, m, t (so E is in kPa and frequencies come out in rad/s).
 */
import { releaseCode, restraintCode, type Member, type Model } from '../model/types';
import { Skyline, subspace } from './linalg';

/** Standard gravitational acceleration (m/s²). */
export const G0 = 9.80665;
const DOF = ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ'];
export type Vec6 = number[];

export interface MemberResult {
  L: number;
  /** Forces acting on the member at ends A and B, local axes. */
  end: number[];
  x: number[]; N: number[]; Vy: number[]; Vz: number[]; T: number[]; My: number[]; Mz: number[];
  /** Local deflections along the member (m), including the end displacements. */
  dx: number[]; dy: number[]; dz: number[];
  active: boolean;
}
export interface ModeSet { values: number[]; shapes: Map<number, Vec6>[] }
export interface CaseResult {
  id: number; name: string; combo: boolean;
  disp: Map<number, Vec6>; reactions: Map<number, Vec6>; members: Map<number, MemberResult>;
  iterations: number; error?: string;
  /** Load factors on this case at elastic critical buckling. */
  buckling?: ModeSet;
}
export interface Analysis {
  errors: string[]; warnings: string[]; cases: CaseResult[];
  /** Natural frequencies (Hz). */
  modal?: ModeSet;
  ms: number;
}

/** Rows are the member's local x, y, z axes in global coordinates. */
export function memberAxes(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, angleDeg: number): { L: number; R: number[][] } {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z], L = Math.hypot(d[0], d[1], d[2]);
  const x = d.map(v => v / (L || 1));
  let z: number[];
  if (Math.abs(x[1]) > 0.9999) z = [0, 0, 1];
  else { z = [-x[2], 0, x[0]]; const n = Math.hypot(z[0], z[2]); z = z.map(v => v / n); } // x × Y
  let y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const c = Math.cos(angleDeg * Math.PI / 180), s = Math.sin(angleDeg * Math.PI / 180);
  const y2 = y.map((v, i) => c * v + s * z[i]), z2 = z.map((v, i) => -s * y[i] + c * v);
  y = y2;
  return { L, R: [x, y, z2] };
}

type M12 = number[][];
const zeros12 = (): M12 => Array.from({ length: 12 }, () => new Array(12).fill(0));
const sym = (k: M12, i: number, j: number, v: number) => { k[i][j] += v; if (i !== j) k[j][i] += v; };

function elastic(EA: number, EIy: number, EIz: number, GJ: number, L: number): M12 {
  const k = zeros12(), L2 = L * L, L3 = L2 * L;
  sym(k, 0, 0, EA / L); sym(k, 6, 6, EA / L); sym(k, 0, 6, -EA / L);
  sym(k, 3, 3, GJ / L); sym(k, 9, 9, GJ / L); sym(k, 3, 9, -GJ / L);
  let a = 12 * EIz / L3, b = 6 * EIz / L2, c = 4 * EIz / L;
  sym(k, 1, 1, a); sym(k, 7, 7, a); sym(k, 1, 7, -a); sym(k, 1, 5, b); sym(k, 1, 11, b); sym(k, 5, 7, -b); sym(k, 7, 11, -b);
  sym(k, 5, 5, c); sym(k, 11, 11, c); sym(k, 5, 11, c / 2);
  a = 12 * EIy / L3; b = 6 * EIy / L2; c = 4 * EIy / L;
  sym(k, 2, 2, a); sym(k, 8, 8, a); sym(k, 2, 8, -a); sym(k, 2, 4, -b); sym(k, 2, 10, -b); sym(k, 4, 8, b); sym(k, 8, 10, b);
  sym(k, 4, 4, c); sym(k, 10, 10, c); sym(k, 4, 10, c / 2);
  return k;
}
/** Geometric stiffness for an axial force P (tension positive). */
function geometric(P: number, L: number): M12 {
  const k = zeros12(), f = P / (30 * L), a = 36 * f, b = 3 * L * f, c = 4 * L * L * f, d = -L * L * f;
  sym(k, 1, 1, a); sym(k, 7, 7, a); sym(k, 1, 7, -a); sym(k, 1, 5, b); sym(k, 1, 11, b); sym(k, 5, 7, -b); sym(k, 7, 11, -b);
  sym(k, 5, 5, c); sym(k, 11, 11, c); sym(k, 5, 11, d);
  sym(k, 2, 2, a); sym(k, 8, 8, a); sym(k, 2, 8, -a); sym(k, 2, 4, -b); sym(k, 2, 10, -b); sym(k, 4, 8, b); sym(k, 8, 10, b);
  sym(k, 4, 4, c); sym(k, 10, 10, c); sym(k, 4, 10, d);
  return k;
}

/** Condensation transform for released end DOFs: K' = TᵀKT, f' = Tᵀf. Returns null if the releases leave a mechanism. */
function condenser(k: M12, rel: boolean[]): M12 | null {
  const r = rel.map((v, i) => (v ? i : -1)).filter(i => i >= 0), T = zeros12();
  for (let i = 0; i < 12; i++) if (!rel[i]) T[i][i] = 1;
  if (!r.length) return T;
  const m = r.length, A = r.map(i => [...r.map(j => k[i][j]), ...Array.from({ length: 12 }, (_, c) => (rel[c] ? 0 : k[i][c]))]);
  const scale = Math.max(...r.map(i => Math.abs(k[i][i])));
  for (let p = 0; p < m; p++) { // Gauss–Jordan on [Krr | Krc]
    let best = p; for (let i = p + 1; i < m; i++) if (Math.abs(A[i][p]) > Math.abs(A[best][p])) best = i;
    if (Math.abs(A[best][p]) < 1e-9 * scale || scale === 0) return null;
    [A[p], A[best]] = [A[best], A[p]];
    const d = A[p][p]; for (let c = p; c < m + 12; c++) A[p][c] /= d;
    for (let i = 0; i < m; i++) if (i !== p && A[i][p] !== 0) { const f = A[i][p]; for (let c = p; c < m + 12; c++) A[i][c] -= f * A[p][c]; }
  }
  for (let a = 0; a < m; a++) for (let c = 0; c < 12; c++) T[r[a]][c] = -A[a][m + c];
  return T;
}
const tKt = (T: M12, k: M12): M12 => {
  const kt = k.map(row => T[0].map((_, c) => row.reduce((s, v, j) => s + v * T[j][c], 0)));
  return T[0].map((_, i) => T[0].map((__, c) => T.reduce((s, row, j) => s + row[i] * kt[j][c], 0)));
};
const tVec = (T: M12, f: number[]) => T[0].map((_, i) => T.reduce((s, row, j) => s + row[i] * f[j], 0));

interface Load { // in member local axes
  dist: { s: number; e: number; q1: number[]; q2: number[] }[];
  point: { x: number; F: number[]; M: number[] }[];
  strain: number; // free thermal strain
}
interface El {
  m: Member; ia: number; ib: number; L: number; R: number[][];
  EA: number; EIy: number; EIz: number; GJ: number; wSelf: number; alpha: number; mass: number;
  rel: boolean[]; dofs: number[]; tension: boolean; compression: boolean;
}

const toLocal = (R: number[][], v: number[]) => R.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const toGlobal = (R: number[][], v: number[]) => [0, 1, 2].map(i => R[0][i] * v[0] + R[1][i] * v[1] + R[2][i] * v[2]);
const rot12 = (R: number[][], v: number[], back = false) => [0, 3, 6, 9].flatMap(o => (back ? toGlobal : toLocal)(R, v.slice(o, o + 3)));

/** Fixed-end forces (forces on the member ends with both ends held) for the loads on a member. */
function fixedEnd(el: El, ld: Load): number[] {
  const L = el.L, eq = new Array(12).fill(0);
  const shape = (xi: number) => [1 - 3 * xi * xi + 2 * xi ** 3, L * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, L * (xi ** 3 - xi * xi)];
  const dshape = (xi: number) => [(-6 * xi + 6 * xi * xi) / L, 1 - 4 * xi + 3 * xi * xi, (6 * xi - 6 * xi * xi) / L, 3 * xi * xi - 2 * xi];
  const force = (xi: number, F: number[]) => {
    const n = shape(xi);
    eq[0] += (1 - xi) * F[0]; eq[6] += xi * F[0];
    eq[1] += n[0] * F[1]; eq[5] += n[1] * F[1]; eq[7] += n[2] * F[1]; eq[11] += n[3] * F[1];
    eq[2] += n[0] * F[2]; eq[4] -= n[1] * F[2]; eq[8] += n[2] * F[2]; eq[10] -= n[3] * F[2];
  };
  const GP = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];
  for (const d of ld.dist) {
    const len = d.e - d.s; if (len <= 0) continue;
    for (const [g, w] of GP) { const t = (g + 1) / 2, x = d.s + t * len; force(x / L, d.q1.map((q, i) => (q + (d.q2[i] - q) * t) * w * len / 2)); }
  }
  for (const p of ld.point) {
    const xi = p.x / L, dn = dshape(xi);
    force(xi, p.F);
    eq[3] += (1 - xi) * p.M[0]; eq[9] += xi * p.M[0];
    eq[1] += dn[0] * p.M[2]; eq[5] += dn[1] * p.M[2]; eq[7] += dn[2] * p.M[2]; eq[11] += dn[3] * p.M[2];
    eq[2] -= dn[0] * p.M[1]; eq[4] += dn[1] * p.M[1]; eq[8] -= dn[2] * p.M[1]; eq[10] += dn[3] * p.M[1];
  }
  const f = eq.map(v => -v);
  f[0] += el.EA * ld.strain; f[6] -= el.EA * ld.strain;
  return f;
}

/** Result stations along each member, in addition to the ends of point and distributed loads. */
const STATIONS = 21;

/** Internal actions and deflections along a member from its end forces, end displacements and loads. */
function stations(el: El, ld: Load, end: number[], u: number[], nStations: number, active: boolean): MemberResult {
  const L = el.L, xs: [number, boolean][] = [];
  for (let i = 0; i < nStations; i++) xs.push([L * i / (nStations - 1), true]);
  for (const p of ld.point) if (p.x > 1e-9 && p.x < L - 1e-9) xs.push([p.x, false], [p.x, true]);
  for (const d of ld.dist) for (const x of [d.s, d.e]) if (x > 1e-9 && x < L - 1e-9) xs.push([x, true]);
  xs.sort((a, b) => a[0] - b[0] || Number(a[1]) - Number(b[1]));
  const pts = xs.filter((p, i) => i === 0 || p[0] - xs[i - 1][0] > 1e-9 || p[1] !== xs[i - 1][1]);
  const at = (x: number, incl: boolean) => {
    const S = [end[0], end[1], end[2]]; let Mx = end[3], My = end[4] + x * end[2], Mz = end[5] - x * end[1];
    for (const d of ld.dist) {
      const c = Math.min(x, d.e) - d.s, len = d.e - d.s; if (c <= 0 || len <= 0) continue;
      for (let i = 0; i < 3; i++) {
        const k = (d.q2[i] - d.q1[i]) / len, F = d.q1[i] * c + k * c * c / 2, m1 = (d.s - x) * F + d.q1[i] * c * c / 2 + k * c ** 3 / 3;
        S[i] += F; if (i === 1) Mz += m1; if (i === 2) My -= m1;
      }
    }
    for (const p of ld.point) if (p.x < x - 1e-9 || (incl && p.x <= x + 1e-9)) {
      for (let i = 0; i < 3; i++) S[i] += p.F[i];
      Mz += (p.x - x) * p.F[1] + p.M[2]; My += -(p.x - x) * p.F[2] + p.M[1]; Mx += p.M[0];
    }
    return { N: -S[0], Vy: S[1], Vz: S[2], T: -Mx, My: -My, Mz: -Mz };
  };
  const r: MemberResult = { L, end, x: [], N: [], Vy: [], Vz: [], T: [], My: [], Mz: [], dx: [], dy: [], dz: [], active };
  const EA = el.EA, cur = (x: number, incl: boolean) => { const f = at(x, incl); return [f.N / EA + ld.strain, el.EIz > 0 ? f.Mz / el.EIz : 0, el.EIy > 0 ? -f.My / el.EIy : 0]; };
  let ax = 0; const th = [0, 0], v = [0, 0];
  pts.forEach(([x, incl], i) => {
    if (i > 0 && x - pts[i - 1][0] > 1e-12) { // Simpson over the interval
      const x0 = pts[i - 1][0], h = x - x0, k0 = cur(x0, true), km = cur(x0 + h / 2, true), k1 = cur(x, false);
      ax += h / 6 * (k0[0] + 4 * km[0] + k1[0]);
      for (let j = 0; j < 2; j++) { v[j] += th[j] * h + h / 6 * (h * k0[j + 1] + 2 * h * km[j + 1]); th[j] += h / 6 * (k0[j + 1] + 4 * km[j + 1] + k1[j + 1]); }
    }
    const f = at(x, incl);
    r.x.push(x); r.N.push(f.N); r.Vy.push(f.Vy); r.Vz.push(f.Vz); r.T.push(f.T); r.My.push(f.My); r.Mz.push(f.Mz);
    r.dx.push(ax); r.dy.push(v[0]); r.dz.push(v[1]);
  });
  // Fit the end displacements: a linear correction closes the chord (this supplies the unknown start slope).
  const fit = (arr: number[], u0: number, u1: number) => { const e = u1 - u0 - arr[arr.length - 1]; return arr.map((d, i) => u0 + d + e * r.x[i] / L); };
  r.dx = fit(r.dx, u[0], u[6]); r.dy = fit(r.dy, u[1], u[7]); r.dz = fit(r.dz, u[2], u[8]);
  return r;
}

export function analyse(model: Model): Analysis {
  const t0 = performance.now();
  const out: Analysis = { errors: [], warnings: [], cases: [], ms: 0 };
  const err = (s: string) => { if (out.errors.length < 30) out.errors.push(s); };
  const { nodes, members } = model;
  if (!nodes.length || !members.length) { err('The model needs at least one member.'); return out; }

  // ---- Validation and element set-up
  const nodeIx = new Map(nodes.map((n, i) => [n.id, i]));
  const secs = new Map(model.sections.map(s => [s.id, s])), mats = new Map(model.materials.map(s => [s.id, s]));
  const els: El[] = [];
  for (const m of members) {
    const ia = nodeIx.get(m.a), ib = nodeIx.get(m.b), s = secs.get(m.sec), mt = mats.get(m.mat);
    if (ia === undefined || ib === undefined) { err(`Member ${m.id}: node ${ia === undefined ? m.a : m.b} does not exist.`); continue; }
    if (!s) { err(`Member ${m.id}: section ${m.sec} does not exist.`); continue; }
    if (!mt) { err(`Member ${m.id}: material ${m.mat} does not exist.`); continue; }
    const { L, R } = memberAxes(nodes[ia], nodes[ib], m.angle || 0);
    if (L < 1e-6) { err(`Member ${m.id} has zero length.`); continue; }
    if (!(s.A > 0) || !(mt.E > 0)) { err(`Member ${m.id}: the section area and the material modulus must be positive.`); continue; }
    const rel = [...releaseCode(m.relA), ...releaseCode(m.relB)].map(c => c.toUpperCase() === 'R');
    let GJ = mt.G * 1e3 * s.J * 1e-12;
    if (rel[3] && rel[9]) { rel[3] = rel[9] = false; GJ = 0; } // torsion released at both ends: no torsional stiffness
    if (rel[0] && rel[6]) { err(`Member ${m.id}: the axial force is released at both ends.`); continue; }
    els.push({
      m, ia, ib, L, R, EA: mt.E * 1e3 * s.A * 1e-6, EIy: mt.E * 1e3 * s.Iy * 1e-12, EIz: mt.E * 1e3 * s.Iz * 1e-12, GJ,
      wSelf: mt.rho * s.A * 1e-6 * G0 / 1000, alpha: mt.alpha || 0, mass: mt.rho * s.A * 1e-6 * L / 1000,
      rel, dofs: [], tension: m.type === 'T', compression: m.type === 'C',
    });
  }
  const ids = [...model.loadCases, ...model.combos].map(c => c.id);
  if (new Set(ids).size !== ids.length) err('Load case and combination numbers must be unique.');
  if (!model.loadCases.length) err('The model has no load cases.');
  if (out.errors.length) return out;

  // ---- Equation numbering (reverse Cuthill–McKee over the nodes to keep the profile small)
  const adj: number[][] = nodes.map(() => []);
  for (const e of els) { adj[e.ia].push(e.ib); adj[e.ib].push(e.ia); }
  const order: number[] = [], seen = new Uint8Array(nodes.length);
  const byDeg = nodes.map((_, i) => i).sort((a, b) => adj[a].length - adj[b].length);
  for (const start of byDeg) {
    if (seen[start]) continue;
    const queue = [start]; seen[start] = 1;
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h]; order.push(c);
      for (const nb of adj[c].filter(v => !seen[v]).sort((a, b) => adj[a].length - adj[b].length)) if (!seen[nb]) { seen[nb] = 1; queue.push(nb); }
    }
  }
  order.reverse();
  const eq = new Int32Array(nodes.length * 6).fill(-1); let neq = 0;
  const eqNode: number[] = [], eqDof: number[] = [];
  for (const i of order) {
    if (!adj[i].length) continue; // unconnected node: not part of the structure
    const r = restraintCode(nodes[i].r);
    for (let d = 0; d < 6; d++) if (r[d] !== 'F') { eq[i * 6 + d] = neq++; eqNode.push(i); eqDof.push(d); }
  }
  const loose = nodes.filter((_, i) => !adj[i].length);
  if (loose.length) out.warnings.push(`Node${loose.length > 1 ? 's' : ''} ${loose.map(n => n.id).join(', ')} not connected to a member; ignored.`);
  for (const e of els) e.dofs = [...Array.from({ length: 6 }, (_, d) => e.ia * 6 + d), ...Array.from({ length: 6 }, (_, d) => e.ib * 6 + d)];
  const first = Int32Array.from({ length: neq }, (_, i) => i);
  for (const e of els) {
    const q = e.dofs.map(d => eq[d]).filter(v => v >= 0), lo = Math.min(...q);
    for (const v of q) if (lo < first[v]) first[v] = lo;
  }
  const springs = model.springs.flatMap(s => { const i = nodeIx.get(s.node); return i === undefined ? [] : s.k.map((k, d) => ({ dof: i * 6 + d, k: k || 0 })).filter(v => v.k > 0 && eq[v.dof] >= 0); });

  // ---- Loads, grouped by load case and member
  const mIx = new Map(els.map((e, i) => [e.m.id, i]));
  const lcs = new Map(model.loadCases.map(c => [c.id, c]));
  const D = { X: 0, Y: 1, Z: 2 } as const;
  const unit = (i: number) => [0, 1, 2].map(j => (i === j ? 1 : 0));
  const caseLoads = new Map<number, Map<number, Load>>();
  const loadOf = (lc: number, mi: number): Load => {
    let m = caseLoads.get(lc); if (!m) caseLoads.set(lc, m = new Map());
    let l = m.get(mi); if (!l) m.set(mi, l = { dist: [], point: [], strain: 0 });
    return l;
  };
  for (const c of model.loadCases) if (c.gx || c.gy || c.gz) els.forEach((e, i) => {
    const q = toLocal(e.R, [c.gx, c.gy, c.gz].map(g => (g || 0) * e.wSelf)); loadOf(c.id, i).dist.push({ s: 0, e: e.L, q1: q, q2: q });
  });
  for (const l of model.distLoads) {
    const i = mIx.get(l.member); if (i === undefined || !lcs.has(l.lc)) continue;
    const e = els[i], dir = l.axes === 'L' ? unit(D[l.dir]) : toLocal(e.R, unit(D[l.dir]));
    const s = Math.max(0, Math.min(100, l.s || 0)) / 100 * e.L, en = Math.max(0, Math.min(100, l.e ?? 100)) / 100 * e.L;
    if (en > s) loadOf(l.lc, i).dist.push({ s, e: en, q1: dir.map(v => v * (l.w1 || 0)), q2: dir.map(v => v * (l.w2 || 0)) });
  }
  for (const l of model.pointLoads) {
    const i = mIx.get(l.member); if (i === undefined || !lcs.has(l.lc)) continue;
    const e = els[i], mom = l.dir.length === 2, ax = D[l.dir.slice(-1) as 'X'], dir = (l.axes === 'L' ? unit(ax) : toLocal(e.R, unit(ax))).map(v => v * (l.p || 0));
    loadOf(l.lc, i).point.push({ x: Math.max(0, Math.min(100, l.pos || 0)) / 100 * e.L, F: mom ? [0, 0, 0] : dir, M: mom ? dir : [0, 0, 0] });
  }
  for (const l of model.thermal) { const i = mIx.get(l.member); if (i !== undefined && lcs.has(l.lc)) loadOf(l.lc, i).strain += els[i].alpha * (l.dT || 0); }

  // ---- Assembly
  const linearOnly = !model.settings.nonlinear && !els.some(e => e.tension || e.compression);
  interface Built { K: Skyline; kl: M12[]; T: (M12 | null)[]; auto: number[] }
  const build = (active: boolean[], axial: number[] | null, geoOnly = false): Built | string => {
    const K = new Skyline(first), kl: M12[] = [], Ts: (M12 | null)[] = [];
    for (let i = 0; i < els.length; i++) {
      const e = els[i], ke = elastic(e.EA * (active[i] ? 1 : 1e-8), e.EIy, e.EIz, e.GJ, e.L);
      const T = condenser(ke, e.rel);
      if (!T) return `Member ${e.m.id}: the end releases leave the member unstable.`;
      let k = geoOnly ? zeros12() : tKt(T, ke);
      if (axial && axial[i] !== 0) { const kg = tKt(T, geometric(axial[i], e.L)); k = k.map((r, a) => r.map((v, b) => v + kg[a][b])); }
      kl.push(k); Ts.push(T);
      // global: Λᵀ k Λ, done in 3 × 3 blocks
      const R = e.R;
      for (let bi = 0; bi < 4; bi++) for (let bj = bi; bj < 4; bj++) {
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          let s = 0;
          for (let p = 0; p < 3; p++) { const rpa = R[p][a]; if (rpa === 0) continue; for (let q = 0; q < 3; q++) s += rpa * k[bi * 3 + p][bj * 3 + q] * R[q][b]; }
          const ei = eq[e.dofs[bi * 3 + a]], ej = eq[e.dofs[bj * 3 + b]];
          if (ei < 0 || ej < 0 || s === 0) continue;
          if (bi === bj) { if (b >= a) K.add(ei, ej, s); } else K.add(ei, ej, s);
        }
      }
    }
    const auto: number[] = [];
    if (!geoOnly) {
      for (const s of springs) K.add(eq[s.dof], eq[s.dof], s.k);
      let dmax = 0; for (let i = 0; i < neq; i++) dmax = Math.max(dmax, Math.abs(K.diag(i)));
      for (let i = 0; i < neq; i++) if (Math.abs(K.diag(i)) < 1e-12 * dmax) { K.setDiag(i, 1); auto.push(i); } // unstiffened DOF (e.g. rotation at a truss node)
    }
    return { K, kl, T: Ts, auto };
  };
  const unstable = (i: number) => `The structure is unstable at node ${nodes[eqNode[i]].id} (${DOF[eqDof[i]]}). Check the restraints and member end releases.`;

  let shared: Built | null = null;
  const allActive = els.map(() => true);
  if (linearOnly) {
    const b = build(allActive, null);
    if (typeof b === 'string') { err(b); return out; }
    const bad = b.K.factor();
    if (bad >= 0) { err(unstable(bad)); return out; }
    shared = b;
  }

  // ---- Solve each load case and combination
  const cases = [
    ...model.loadCases.map(c => ({ id: c.id, name: c.name, combo: false, f: [[c.id, 1]] as [number, number][] })),
    ...model.combos.map(c => ({ id: c.id, name: c.name, combo: true, f: Object.entries(c.f).map(([k, v]) => [Number(k), Number(v)] as [number, number]).filter(([k, v]) => v && lcs.has(k)) })),
  ];
  const nStations = STATIONS;
  const massVec = new Float64Array(neq);
  const shapeOf = (x: Float64Array) => {
    let mx = 0; for (let i = 0; i < neq; i++) if (eqDof[i] < 3) mx = Math.max(mx, Math.abs(x[i]));
    if (mx === 0) for (let i = 0; i < neq; i++) mx = Math.max(mx, Math.abs(x[i]));
    let big = 0; for (let i = 0; i < neq; i++) if (Math.abs(x[i]) > Math.abs(big)) big = x[i];
    const sc = (big < 0 ? -1 : 1) / (mx || 1), m = new Map<number, Vec6>();
    nodes.forEach((n, i) => m.set(n.id, Array.from({ length: 6 }, (_, d) => (eq[i * 6 + d] >= 0 ? x[eq[i * 6 + d]] * sc : 0))));
    return m;
  };

  for (const c of cases) {
    const res: CaseResult = { id: c.id, name: c.name, combo: c.combo, disp: new Map(), reactions: new Map(), members: new Map(), iterations: 0 };
    out.cases.push(res);
    // combined member loads, nodal loads and prescribed displacements
    const loads: Load[] = els.map(() => ({ dist: [], point: [], strain: 0 }));
    const P = new Float64Array(nodes.length * 6), up = new Float64Array(nodes.length * 6);
    for (const [lc, f] of c.f) {
      caseLoads.get(lc)?.forEach((l, i) => {
        const t = loads[i];
        t.dist.push(...l.dist.map(d => ({ ...d, q1: d.q1.map(v => v * f), q2: d.q2.map(v => v * f) })));
        t.point.push(...l.point.map(p => ({ x: p.x, F: p.F.map(v => v * f), M: p.M.map(v => v * f) })));
        t.strain += l.strain * f;
      });
      for (const l of model.nodeLoads) if (l.lc === lc) { const i = nodeIx.get(l.node); if (i !== undefined) [l.fx, l.fy, l.fz, l.mx, l.my, l.mz].forEach((v, d) => { P[i * 6 + d] += (v || 0) * f; }); }
      for (const l of model.settlements) if (l.lc === lc) { const i = nodeIx.get(l.node); if (i !== undefined) [l.dx, l.dy, l.dz].forEach((v, d) => { if (eq[i * 6 + d] < 0) up[i * 6 + d] += (v || 0) * f / 1000; }); }
    }
    const fef = els.map((e, i) => fixedEnd(e, loads[i]));
    const hasUp = up.some(v => v !== 0);

    let active = allActive.slice(), axial: number[] | null = null, u: Float64Array = new Float64Array(neq), built = shared!;
    let ends: number[][] = [], uloc: number[][] = [];
    const seenStates = new Set<string>();
    const maxIter = linearOnly ? 1 : 40;
    for (let it = 0; it < maxIter; it++) {
      res.iterations = it + 1;
      if (!linearOnly) {
        const b = build(active, model.settings.nonlinear ? axial : null);
        if (typeof b === 'string') { res.error = b; break; }
        const bad = b.K.factor();
        if (bad >= 0) { res.error = axial ? `The structure buckles under this load (instability at node ${nodes[eqNode[bad]].id}, ${DOF[eqDof[bad]]}).` : unstable(bad); break; }
        built = b;
      }
      const F = new Float64Array(neq);
      for (let d = 0; d < P.length; d++) if (eq[d] >= 0) F[eq[d]] += P[d];
      els.forEach((e, i) => {
        let f = tVec(built.T[i]!, fef[i]);
        if (hasUp) { const ul = rot12(e.R, e.dofs.map(d => up[d])); if (ul.some(v => v !== 0)) f = f.map((v, a) => v + built.kl[i][a].reduce((s, k, b) => s + k * ul[b], 0)); }
        rot12(e.R, f, true).forEach((v, a) => { const q = eq[e.dofs[a]]; if (q >= 0) F[q] -= v; });
      });
      for (const a of built.auto) F[a] = 0;
      const un = built.K.solve(F);
      // member end forces
      ends = []; uloc = [];
      const full = (d: number) => (eq[d] >= 0 ? un[eq[d]] : up[d]);
      els.forEach((e, i) => {
        const ul = rot12(e.R, e.dofs.map(full)), f0 = tVec(built.T[i]!, fef[i]);
        ends.push(f0.map((v, a) => v + built.kl[i][a].reduce((s, k, b) => s + k * ul[b], 0))); uloc.push(ul);
      });
      const N = ends.map(f => (f[6] - f[0]) / 2);
      // tension-only and compression-only members
      let changed = false;
      els.forEach((e, i) => {
        if (!e.tension && !e.compression) return;
        const tol = 1e-9 * e.EA;
        if (active[i]) { if ((e.tension && N[i] < -tol) || (e.compression && N[i] > tol)) { active[i] = false; changed = true; } }
        else { const ext = uloc[i][6] - uloc[i][0] - loads[i].strain * e.L; if ((e.tension && ext > 1e-12) || (e.compression && ext < -1e-12)) { active[i] = true; changed = true; } }
      });
      let du = 0, um = 0; for (let i = 0; i < neq; i++) { du = Math.max(du, Math.abs(un[i] - u[i])); um = Math.max(um, Math.abs(un[i])); }
      u = un;
      if (linearOnly) break;
      if (changed) { const key = active.map(a => (a ? 1 : 0)).join(''); if (seenStates.has(key)) { out.warnings.push(`Case ${c.id}: the tension-only/compression-only members did not settle; the last state is reported.`); changed = false; } seenStates.add(key); }
      const converged = !changed && (!model.settings.nonlinear || (it > 0 && du <= 1e-7 * um + 1e-14));
      axial = N.map((n, i) => (active[i] ? n : 0));
      if (converged) break;
      if (it === maxIter - 1) res.error = 'The analysis did not converge.';
    }
    if (res.error) { out.warnings.push(`Case ${c.id} (${c.name}): ${res.error}`); continue; }

    // results
    const full = (d: number) => (eq[d] >= 0 ? u[eq[d]] : up[d]);
    nodes.forEach((n, i) => res.disp.set(n.id, Array.from({ length: 6 }, (_, d) => full(i * 6 + d))));
    const react = new Float64Array(nodes.length * 6);
    els.forEach((e, i) => {
      rot12(e.R, ends[i], true).forEach((v, a) => { react[e.dofs[a]] += v; });
      res.members.set(e.m.id, stations(e, loads[i], ends[i], uloc[i], nStations, active[i]));
    });
    for (const s of springs) react[s.dof] = -s.k * u[eq[s.dof]] + P[s.dof];
    const sprung = new Set(springs.map(s => s.dof));
    nodes.forEach((n, i) => {
      const r = Array.from({ length: 6 }, (_, d) => (eq[i * 6 + d] < 0 || sprung.has(i * 6 + d) ? react[i * 6 + d] - P[i * 6 + d] : 0));
      if (adj[i].length && Array.from({ length: 6 }, (_, d) => eq[i * 6 + d] < 0 || sprung.has(i * 6 + d)).some(Boolean)) res.reactions.set(n.id, r);
    });

    // elastic critical buckling of this case
    if (model.settings.bucklingModes > 0) {
      const lin = N0(ends);
      if (lin.some(n => n < -1e-9)) {
        const ke = linearOnly ? shared! : (() => { const b = build(active, null); if (typeof b === 'string' || b.K.factor() >= 0) return null; return b; })();
        const kg = build(active, lin.map((n, i) => (active[i] ? n : 0)), true);
        if (ke && typeof kg !== 'string') {
          const r = subspace(ke.K, x => { const y = kg.K.mul(x); for (let i = 0; i < neq; i++) y[i] = -y[i]; for (const a of ke.auto) y[a] = 0; return y; }, model.settings.bucklingModes);
          res.buckling = { values: r.values, shapes: r.vectors.map(shapeOf) };
        }
      }
    }
  }
  function N0(ends: number[][]) { return ends.map(f => (f[6] - f[0]) / 2); }

  // ---- Natural frequencies
  if (model.settings.modalModes > 0) {
    els.forEach(e => { for (const i of [e.ia, e.ib]) for (let d = 0; d < 3; d++) if (eq[i * 6 + d] >= 0) massVec[eq[i * 6 + d]] += e.mass / 2; });
    for (const m of model.masses) { const i = nodeIx.get(m.node); if (i !== undefined) for (let d = 0; d < 3; d++) if (eq[i * 6 + d] >= 0) massVec[eq[i * 6 + d]] += m.m || 0; }
    const ke = shared ?? (() => { const b = build(allActive, null); if (typeof b === 'string' || b.K.factor() >= 0) return null; return b; })();
    if (ke) {
      for (const a of ke.auto) massVec[a] = 0;
      const want = Math.min(model.settings.modalModes, massVec.filter(v => v > 0).length);
      const r = subspace(ke.K, x => x.map((v, i) => v * massVec[i]), want);
      out.modal = { values: r.values.map(v => Math.sqrt(Math.max(v, 0)) / (2 * Math.PI)), shapes: r.vectors.map(shapeOf) };
    } else out.warnings.push('Natural frequencies were not calculated: the structure is unstable.');
  }
  out.ms = performance.now() - t0;
  return out;
}
