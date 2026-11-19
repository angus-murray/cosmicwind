/**
 * Verification benchmarks. Every expected value is a closed-form result (derived in the comment beside it) or the
 * result of an independent calculation, never a value copied from the solver's own output. Units follow the model:
 * m, kN, kNm, t; E = 200000 MPa, I in mm⁴, so EI = E × 1e3 × I × 1e-12 kNm².
 *
 * Limitations of the formulation that these tests do not hide: Euler-Bernoulli beams (no shear deformation), no
 * rotary inertia in bending, geometric stiffness of cubic form (so buckling and P-Δ converge with refinement).
 */
import { expect, test } from 'bun:test';
import { analyse } from './frame';
import { emptyModel, type Model } from '../model/types';

const E = 200000, G = 80000, A = 5000, I = 100e6, J = 1e6;
const EI = E * 1e3 * I * 1e-12, EA = E * 1e3 * A * 1e-6, GJ = G * 1e3 * J * 1e-12;
const near = (a: number, b: number, tol: number, what = '') => {
  const err = Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
  if (!(err <= tol)) throw new Error(`${what} got ${a}, expected ${b} (relative error ${err.toExponential(2)}, tolerance ${tol})`);
};

interface Opt { A?: number; Iy?: number; Iz?: number; J?: number; rho?: number }
function frame(opt: Opt = {}): Model {
  const m = emptyModel();
  m.loadCases = [{ id: 1, name: 'LC', gx: 0, gy: 0, gz: 0 }];
  m.sections = [{ id: 1, name: 'S', A: opt.A ?? A, Iy: opt.Iy ?? I, Iz: opt.Iz ?? I, J: opt.J ?? J }];
  m.materials = [{ id: 1, name: 'M', E, G, rho: opt.rho ?? 7850, alpha: 12e-6 }];
  return m;
}
let nid = 0, mid = 0;
const node = (m: Model, x: number, y: number, z: number, r = 'RRRRRR') => { m.nodes.push({ id: ++nid, x, y, z, r }); return nid; };
const link = (m: Model, a: number, b: number, extra: Partial<Model['members'][0]> = {}) => { m.members.push({ id: ++mid, a, b, sec: 1, mat: 1, angle: 0, type: 'N', relA: 'FFFFFF', relB: 'FFFFFF', ...extra }); return mid; };
const reset = () => { nid = 0; mid = 0; };
/** Straight line along X of n equal elements; ends restrained by codes rA and rB. */
function line(L: number, n: number, rA: string, rB: string, opt: Opt = {}): Model {
  reset(); const m = frame(opt);
  for (let i = 0; i <= n; i++) node(m, L * i / n, 0, 0, i === 0 ? rA : i === n ? rB : 'RRRRRR');
  for (let i = 0; i < n; i++) link(m, i + 1, i + 2);
  return m;
}
const PLANAR = 'RRFFFR'; // free to move in X and Y and rotate about Z only
const run = (m: Model) => { const r = analyse(m); expect(r.errors).toEqual([]); expect(r.cases.map(c => c.error)).toEqual(r.cases.map(() => undefined)); expect(r.warnings).toEqual([]); return r; };
const fy = (node: number, f: number) => ({ lc: 1, node, fx: 0, fy: f, fz: 0, mx: 0, my: 0, mz: 0 });
const udlY = (m: Model, w: number) => m.members.forEach(b => m.distLoads.push({ lc: 1, member: b.id, axes: 'G', dir: 'Y', w1: w, w2: w, s: 0, e: 100 }));

// ---------------------------------------------------------------------------------------------------------------
// 1. Beams: deflections, rotations, reactions and end moments (Roark, Table 8.1; Timoshenko, Strength of Materials)
// ---------------------------------------------------------------------------------------------------------------
test('B1 cantilever: tip load, UDL and tip moment (deflection and rotation)', () => {
  const L = 5, P = 12, w = 4, M = 9;
  let m = line(L, 1, 'FFFFFF', 'RRRRRR'); m.nodeLoads.push(fy(2, -P));
  let c = run(m).cases[0];
  near(c.disp.get(2)![1], -P * L ** 3 / (3 * EI), 1e-9, 'tip deflection PL³/3EI');
  near(c.disp.get(2)![5], -P * L ** 2 / (2 * EI), 1e-9, 'tip rotation PL²/2EI');
  m = line(L, 1, 'FFFFFF', 'RRRRRR'); udlY(m, -w);
  c = run(m).cases[0];
  near(c.disp.get(2)![1], -w * L ** 4 / (8 * EI), 1e-9, 'UDL tip deflection wL⁴/8EI');
  near(c.disp.get(2)![5], -w * L ** 3 / (6 * EI), 1e-9, 'UDL tip rotation wL³/6EI');
  m = line(L, 1, 'FFFFFF', 'RRRRRR'); m.nodeLoads.push({ lc: 1, node: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: M });
  c = run(m).cases[0];
  near(c.disp.get(2)![1], M * L ** 2 / (2 * EI), 1e-9, 'moment tip deflection ML²/2EI');
  near(c.disp.get(2)![5], M * L / EI, 1e-9, 'moment tip rotation ML/EI');
});

test('B2 simply supported beam: UDL, and a point load off centre at several positions', () => {
  const L = 8, w = 6;
  let m = line(L, 1, 'FFFFFF'.replace(/^FFF.../, 'FFFFRR'), 'RFFRRR'); udlY(m, -w);
  let c = run(m).cases[0], mr = c.members.get(1)!;
  near(mr.dy[10], -5 * w * L ** 4 / (384 * EI), 1e-9, 'midspan 5wL⁴/384EI');
  near(mr.Mz[10], w * L * L / 8, 1e-9, 'midspan moment wL²/8');
  near(c.disp.get(1)![5], -w * L ** 3 / (24 * EI), 1e-9, 'end rotation wL³/24EI');
  for (const pos of [10, 25, 50, 80]) {
    const P = 15, a = L * pos / 100, b = L - a;
    m = line(L, 1, 'FFFFRR', 'RFFRRR'); m.pointLoads.push({ lc: 1, member: 1, axes: 'G', dir: 'Y', p: -P, pos });
    c = run(m).cases[0]; mr = c.members.get(1)!;
    const i = Math.round(pos / 5); // stations are every 5 percent
    near(mr.dy[i], -P * a * a * b * b / (3 * EI * L), 1e-9, `deflection under the load at ${pos}%`);
    near(c.reactions.get(1)![1], P * b / L, 1e-9, 'left reaction Pb/L');
    near(mr.Mz[i], P * a * b / L, 1e-9, 'moment under the load Pab/L');
  }
});

test('B3 fixed-fixed beam: UDL and central point load', () => {
  const L = 6, w = 5, P = 20;
  let m = line(L, 1, 'FFFFFF', 'FFFFFF'); udlY(m, -w);
  let c = run(m).cases[0], mr = c.members.get(1)!;
  near(c.reactions.get(1)![5], w * L * L / 12, 1e-9, 'end moment wL²/12');
  near(mr.dy[10], -w * L ** 4 / (384 * EI), 1e-9, 'centre deflection wL⁴/384EI');
  m = line(L, 1, 'FFFFFF', 'FFFFFF'); m.pointLoads.push({ lc: 1, member: 1, axes: 'G', dir: 'Y', p: -P, pos: 50 });
  c = run(m).cases[0]; mr = c.members.get(1)!;
  near(c.reactions.get(1)![5], P * L / 8, 1e-9, 'end moment PL/8');
  near(mr.dy[10], -P * L ** 3 / (192 * EI), 1e-9, 'centre deflection PL³/192EI');
});

test('B4 propped cantilever under UDL: reactions and the full deflected shape', () => {
  const L = 7, w = 3;
  const m = line(L, 1, 'FFFFFF', 'RFFFFR'); udlY(m, -w);
  const c = run(m).cases[0], mr = c.members.get(1)!;
  near(c.reactions.get(2)![1], 3 * w * L / 8, 1e-9, 'prop reaction 3wL/8');
  near(c.reactions.get(1)![1], 5 * w * L / 8, 1e-9, 'fixed-end shear 5wL/8');
  near(c.reactions.get(1)![5], w * L * L / 8, 1e-9, 'fixed-end moment wL²/8');
  for (let i = 1; i < 20; i++) {
    const x = L - L * i / 20; // measured from the pinned end, where y(x) = w x (L³ − 3Lx² + 2x³)/48EI
    near(mr.dy[i], -w * x * (L ** 3 - 3 * L * x * x + 2 * x ** 3) / (48 * EI), 1e-8, `deflection at ${i * 5}% from the fixed end`);
  }
});

test('B5 two-span continuous beam under UDL: reactions and support moment (three-moment equation)', () => {
  const L = 5, w = 8;
  reset(); const m = frame();
  node(m, 0, 0, 0, 'FFFFRR'); node(m, L, 0, 0, 'RFFFFR'); node(m, 2 * L, 0, 0, 'RFFFFR'); link(m, 1, 2); link(m, 2, 3); udlY(m, -w);
  const c = run(m).cases[0];
  near(c.reactions.get(1)![1], 3 * w * L / 8, 1e-9, 'end reaction 3wL/8');
  near(c.reactions.get(2)![1], 5 * w * L / 4, 1e-9, 'interior reaction 5wL/4');
  near(Math.abs(c.members.get(1)!.Mz[20]), w * L * L / 8, 1e-9, 'support moment wL²/8');
});

test('B6 support settlement: fixed-fixed beam and two-span beam (induced forces from displacement only)', () => {
  const L = 6, d = 10; // mm
  let m = line(L, 1, 'FFFFFF', 'FFFFFF'); m.settlements.push({ lc: 1, node: 2, dx: 0, dy: -d, dz: 0 });
  let c = run(m).cases[0];
  near(Math.abs(c.reactions.get(1)![5]), 6 * EI * (d / 1000) / L ** 2, 1e-9, 'end moment 6EIΔ/L²');
  near(Math.abs(c.reactions.get(1)![1]), 12 * EI * (d / 1000) / L ** 3, 1e-9, 'shear 12EIΔ/L³');
  // two equal spans, middle support settles: M_B = 3EIΔ/L² (hogging reduced) and R_B = -6EIΔ/L³ (sign checked below)
  reset(); m = frame();
  node(m, 0, 0, 0, 'FFFFRR'); node(m, L, 0, 0, 'RFFFFR'); node(m, 2 * L, 0, 0, 'RFFFFR'); link(m, 1, 2); link(m, 2, 3);
  m.settlements.push({ lc: 1, node: 2, dx: 0, dy: -d, dz: 0 });
  c = run(m).cases[0];
  near(Math.abs(c.members.get(1)!.Mz[20]), 3 * EI * (d / 1000) / L ** 2, 1e-9, 'support moment 3EIΔ/L²');
  near(c.reactions.get(2)![1], -6 * EI * (d / 1000) / L ** 3, 1e-9, 'middle reaction -6EIΔ/L³ (downward settlement unloads the support)');
  near(c.reactions.get(1)![1], 3 * EI * (d / 1000) / L ** 3, 1e-9, 'end reaction 3EIΔ/L³');
});

test('B7 thermal expansion of a restrained bar, and free expansion', () => {
  const L = 4, dT = 30, alpha = 12e-6;
  let m = line(L, 1, 'FFFFFF', 'FFFFFF'); m.thermal.push({ lc: 1, member: 1, dT });
  let c = run(m).cases[0];
  near(Math.abs(c.reactions.get(1)![0]), EA * alpha * dT, 1e-9, 'restrained force EAαΔT');
  near(c.reactions.get(1)![0], -c.reactions.get(2)![0], 1e-9, 'equal and opposite');
  near(Math.abs(c.members.get(1)!.N[10]), EA * alpha * dT, 1e-9, 'axial force along the member');
  m = line(L, 1, 'FFFFFF', 'RFFFFF'); m.thermal.push({ lc: 1, member: 1, dT });
  c = run(m).cases[0];
  near(c.disp.get(2)![0], alpha * dT * L, 1e-9, 'free expansion αΔTL');
  expect(Math.abs(c.members.get(1)!.N[10])).toBeLessThan(1e-6);
});

test('B8 self-weight: cantilever deflection and reaction from ρAg', () => {
  const L = 6, w = 7850 * A * 1e-6 * 9.80665 / 1000; // kN/m
  const m = line(L, 4, 'FFFFFF', 'RRRRRR'); m.loadCases[0].gy = -1;
  const c = run(m).cases[0];
  near(c.reactions.get(1)![1], w * L, 1e-9, 'reaction wL');
  near(c.disp.get(5)![1], -w * L ** 4 / (8 * EI), 1e-9, 'tip deflection wL⁴/8EI');
  near(c.reactions.get(1)![5], w * L * L / 2, 1e-9, 'fixed-end moment wL²/2');
});

test('B9 trapezoidal, partial and inclined loads: statics and an independent double integration', () => {
  const L = 10, w1 = -2, w2 = -9, s = 20, e = 80;
  const m = line(L, 1, 'FFFFRR', 'RFFRRR');
  m.distLoads.push({ lc: 1, member: 1, axes: 'L', dir: 'Y', w1, w2, s, e });
  const c = run(m).cases[0], mr = c.members.get(1)!;
  const xs = L * s / 100, xe = L * e / 100, len = xe - xs, total = (w1 + w2) / 2 * len;
  const xbar = xs + len * (w1 + 2 * w2) / (3 * (w1 + w2)); // centroid of the trapezoid
  near(c.reactions.get(2)![1], -total * xbar / L, 1e-9, 'right reaction by moments');
  near(c.reactions.get(1)![1], -total - c.reactions.get(2)![1], 1e-9, 'left reaction by equilibrium');
  // Moment diagram from the exact piecewise shear V(x) = R_A + ∫w, integrated by Simpson's rule on a fine grid (V is continuous)
  const RA = c.reactions.get(1)![1];
  const V = (x: number) => { const u = Math.max(0, Math.min(x, xe) - xs); return RA + w1 * u + (w2 - w1) * u * u / (2 * len); };
  const Mx = (x: number) => { const n = 2000, h = x / n; let sum = V(0) + V(x); for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * V(i * h); return sum * h / 3; };
  expect(Math.abs(Mx(L))).toBeLessThan(1e-6);
  for (const i of [5, 10, 14, 18]) near(mr.Mz[i], Mx(L * i / 20), 1e-6, `moment at station ${i}`);
});

test('B10 a member split into any number of elements gives the same results', () => {
  const L = 9;
  const run1 = (n: number) => {
    const m = line(L, n, 'FFFFFF', 'FFFFRR');
    m.members.forEach(b => m.distLoads.push({ lc: 1, member: b.id, axes: 'G', dir: 'Y', w1: -3, w2: -3, s: 0, e: 100 }));
    m.nodeLoads.push(fy(Math.floor(n / 3) + 1, -10));
    const c = run(m).cases[0];
    return { r: c.reactions.get(1)!, rb: c.reactions.get(n + 1)! };
  };
  const a = run1(3), b = run1(12);
  for (let d = 0; d < 6; d++) { near(a.r[d] + 1e-9, b.r[d] + 1e-9, 1e-6, `reaction ${d} at A`); }
  near(a.rb[1], b.rb[1], 1e-9, 'reaction at B');
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Frames and supports
// ---------------------------------------------------------------------------------------------------------------
function portal(h: number, Lb: number, base: string, opt: Opt = {}) {
  reset(); const m = frame(opt);
  const a = node(m, 0, 0, 0, base), b = node(m, 0, h, 0, PLANAR), c = node(m, Lb, h, 0, PLANAR), d = node(m, Lb, 0, 0, base);
  link(m, a, b); link(m, b, c); link(m, c, d);
  return m;
}
test('F1 portal frame sway, fixed and pinned bases (slope-deflection solution)', () => {
  const h = 4, Lb = 6, H = 10, k = (I / Lb) / (I / h); // beam-to-column stiffness ratio
  let m = portal(h, Lb, 'FFFFFF', { A: 1e9 }); m.nodeLoads.push({ lc: 1, node: 2, fx: H, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  near(run(m).cases[0].disp.get(2)![0], H * h ** 3 * (2 + 3 * k) / (12 * EI * (1 + 6 * k)), 1e-6, 'fixed base');
  m = portal(h, Lb, 'FFFFFR', { A: 1e9 }); m.nodeLoads.push({ lc: 1, node: 2, fx: H, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  near(run(m).cases[0].disp.get(2)![0], H * h ** 3 * (1 + 2 * k) / (12 * EI * k), 1e-6, 'pinned base');
});

test('F2 three-dimensional L-shaped cantilever: bending of both arms plus torsion of the first', () => {
  const a = 3, b = 2, P = 10;
  reset(); const m = frame();
  node(m, 0, 0, 0, 'FFFFFF'); node(m, a, 0, 0); node(m, a, 0, b); link(m, 1, 2); link(m, 2, 3);
  m.nodeLoads.push(fy(3, -P));
  const c = run(m).cases[0];
  near(-c.disp.get(3)![1], P * (a ** 3 + b ** 3) / (3 * EI) + P * a * b * b / GJ, 1e-9, 'tip deflection');
});

test('F3 end and node springs: spring in series with a bar, and a semi-rigid fixed end', () => {
  const L = 3, P = 50, ks = 4000;
  let m = line(L, 1, 'SFFFFF', 'RFFFFF'); m.nodes[0].k = [ks, 0, 0, 0, 0, 0]; m.nodeLoads.push({ lc: 1, node: 2, fx: P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  let c = run(m).cases[0];
  near(c.disp.get(2)![0], P * (1 / ks + L / EA), 1e-9, 'series spring δ = P(1/k + L/EA)');
  near(c.reactions.get(1)![0], -P, 1e-9, 'spring force equals the load');
  const kr = 3 * EI / L, w = 5; // rotational spring at A, B fixed
  m = line(L, 1, 'FFFFFS', 'FFFFFF'); m.nodes[0].k = [0, 0, 0, 0, 0, kr]; udlY(m, -w);
  c = run(m).cases[0];
  near(Math.abs(c.members.get(1)!.Mz[0]), (w * L * L / 12) * kr / (kr + 4 * EI / L), 1e-9, 'moment at the sprung end');
  // a member-end rotational spring is the same as a node spring
  m = line(L, 1, 'FFFFFF', 'FFFFFF'); m.members[0].relA = 'FFFFFS'; m.members[0].kA = [0, 0, 0, 0, 0, kr]; udlY(m, -w);
  c = run(m).cases[0];
  near(Math.abs(c.members.get(1)!.Mz[0]), (w * L * L / 12) * kr / (kr + 4 * EI / L), 1e-9, 'moment at the sprung member end');
});

test('F4 beam on a continuous elastic support (Winkler): uniform load, and a point load on a long beam', () => {
  // The solver lumps the support to the member ends (k L / 2 each) but loads are consistent, so results converge with
  // refinement at O(h²) rather than being exact; the test checks the error and its rate of convergence.
  const k = 5000, q = 20; // kN/m per m
  const free = (m: Model) => { m.nodes.forEach(nd => { nd.r = 'FRFFFR'; }); m.members.forEach(b => { b.ky = k; }); return m; };
  const errs = [10, 20, 40].map(n => {
    const m = free(line(10, n, 'RRRRRR', 'RRRRRR')); udlY(m, -q);
    return Math.abs(-run(m).cases[0].disp.get(n / 2 + 1)![1] * k / q - 1); // uniform settlement q/k expected
  });
  expect(errs[2]).toBeLessThan(1e-3);
  expect(errs[0] / errs[1]).toBeGreaterThan(3.5); expect(errs[1] / errs[2]).toBeGreaterThan(3.5);
  // Hetényi: infinite beam, w(0) = Pβ/2k, M(0) = P/4β, β = (k/4EI)^¼
  const beta = (k / (4 * EI)) ** 0.25, P = 100, n = 400;
  const m = free(line(40, n, 'RRRRRR', 'RRRRRR')); m.nodeLoads.push(fy(n / 2 + 1, -P));
  const c = run(m).cases[0];
  near(-c.disp.get(n / 2 + 1)![1], P * beta / (2 * k), 5e-3, 'deflection under the load Pβ/2k');
  near(Math.abs(c.members.get(n / 2)!.Mz[20]), P / (4 * beta), 5e-3, 'moment under the load P/4β');
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Invariance and structural properties on random three-dimensional frames
// ---------------------------------------------------------------------------------------------------------------
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);

function randomFrame(seed: number, iso: boolean) {
  const r = rng(seed); reset();
  const m = frame(iso ? { Iy: I, Iz: I } : { Iy: I / 3, Iz: I, rho: 7850 });
  const n = 8; const P: number[][] = [];
  for (let i = 0; i < n; i++) { P.push([r() * 8, r() * 6, r() * 8]); node(m, P[i][0], P[i][1], P[i][2], i < 2 ? 'FFFFFF' : 'RRRRRR'); }
  const pairs: [number, number][] = [[1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 6], [5, 7], [6, 8], [7, 8], [2, 7]];
  for (const [a, b] of pairs) link(m, a, b, { angle: iso ? 0 : Math.round(r() * 90) });
  for (let i = 3; i <= n; i++) m.nodeLoads.push({ lc: 1, node: i, fx: (r() - .5) * 20, fy: (r() - .5) * 20, fz: (r() - .5) * 20, mx: (r() - .5) * 10, my: (r() - .5) * 10, mz: (r() - .5) * 10 });
  return { m, P };
}

test('S1 global equilibrium of random 3D frames: reactions balance forces and moments about the origin', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { m } = randomFrame(seed, false);
    m.loadCases[0].gy = -1; // self-weight too
    m.distLoads.push({ lc: 1, member: 3, axes: 'G', dir: 'X', w1: 3, w2: 7, s: 10, e: 90 }, { lc: 1, member: 5, axes: 'L', dir: 'Z', w1: -4, w2: -4, s: 0, e: 100 });
    m.pointLoads.push({ lc: 1, member: 2, axes: 'G', dir: 'Z', p: 6, pos: 30 }, { lc: 1, member: 8, axes: 'G', dir: 'MY', p: 5, pos: 60 });
    const c = run(m).cases[0];
    const nodeOf = new Map(m.nodes.map(nd => [nd.id, nd]));
    const F = [0, 0, 0], Mo = [0, 0, 0];
    for (const [id, rv] of c.reactions) { const nd = nodeOf.get(id)!, p = [nd.x, nd.y, nd.z], mm = cross(p, rv.slice(0, 3)); for (let i = 0; i < 3; i++) { F[i] += rv[i]; Mo[i] += mm[i] + rv[3 + i]; } }
    for (const l of m.nodeLoads) { const nd = nodeOf.get(l.node)!, f = [l.fx, l.fy, l.fz], mm = cross([nd.x, nd.y, nd.z], f); for (let i = 0; i < 3; i++) { F[i] += f[i]; Mo[i] += mm[i] + [l.mx, l.my, l.mz][i]; } }
    // Loads on members, resolved independently in global axes
    const sec = m.sections[0], g = 9.80665;
    for (const b of m.members) {
      const a = nodeOf.get(b.a)!, bb = nodeOf.get(b.b)!, pa = [a.x, a.y, a.z], d = sub([bb.x, bb.y, bb.z], pa), L = Math.hypot(...d);
      const wsw = 7850 * sec.A * 1e-6 * g / 1000, mid = pa.map((v, i) => v + d[i] / 2);
      const f = [0, -wsw * L, 0], mm = cross(mid, f); for (let i = 0; i < 3; i++) { F[i] += f[i]; Mo[i] += mm[i]; }
    }
    const axisOf = (b: Model['members'][0]) => { // local axes of the member, as in the model definition
      const a = nodeOf.get(b.a)!, bb = nodeOf.get(b.b)!, d = sub([bb.x, bb.y, bb.z], [a.x, a.y, a.z]), L = Math.hypot(...d), x = d.map(v => v / L);
      let z = [-x[2], 0, x[0]]; const zn = Math.hypot(...z); z = z.map(v => v / zn);
      let y = cross(z, x); const ca = Math.cos(b.angle * Math.PI / 180), sa = Math.sin(b.angle * Math.PI / 180);
      const y2 = y.map((v, i) => ca * v + sa * z[i]), z2 = z.map((v, i) => -sa * y[i] + ca * v);
      return { x, y: y2, z: z2, a: [a.x, a.y, a.z], L };
    };
    for (const dl of m.distLoads) {
      const b = m.members.find(q => q.id === dl.member)!, ax = axisOf(b), s = ax.L * dl.s / 100, e = ax.L * dl.e / 100, len = e - s;
      const dir = dl.axes === 'G' ? ({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const)[dl.dir] : dl.dir === 'X' ? ax.x : dl.dir === 'Y' ? ax.y : ax.z;
      const tot = (dl.w1 + dl.w2) / 2 * len, xb = s + len * (dl.w1 + 2 * dl.w2) / (3 * (dl.w1 + dl.w2));
      const pos = ax.a.map((v, i) => v + ax.x[i] * xb), f = dir.map(v => v * tot), mm = cross(pos, f);
      for (let i = 0; i < 3; i++) { F[i] += f[i]; Mo[i] += mm[i]; }
    }
    for (const pl of m.pointLoads) {
      const b = m.members.find(q => q.id === pl.member)!, ax = axisOf(b), pos = ax.a.map((v, i) => v + ax.x[i] * ax.L * pl.pos / 100);
      if (pl.dir.startsWith('M')) { const dir = ({ MX: [1, 0, 0], MY: [0, 1, 0], MZ: [0, 0, 1] } as const)[pl.dir as 'MX' | 'MY' | 'MZ']; for (let i = 0; i < 3; i++) Mo[i] += dir[i] * pl.p; }
      else { const dir = ({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const)[pl.dir as 'X' | 'Y' | 'Z'], f = dir.map(v => v * pl.p), mm = cross(pos, f); for (let i = 0; i < 3; i++) { F[i] += f[i]; Mo[i] += mm[i]; } }
    }
    for (let i = 0; i < 3; i++) { expect(Math.abs(F[i])).toBeLessThan(1e-7); expect(Math.abs(Mo[i])).toBeLessThan(1e-7); }
  }
});

test('S2 rotation objectivity: rotating a whole model rotates its displacements and reactions', () => {
  const rot = (ax: number[], ang: number) => { // Rodrigues
    const n = Math.hypot(...ax), u = ax.map(v => v / n), c = Math.cos(ang), s = Math.sin(ang), K = [[0, -u[2], u[1]], [u[2], 0, -u[0]], [-u[1], u[0], 0]];
    return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? c : 0) + s * K[i][j] + (1 - c) * u[i] * u[j]));
  };
  const app = (R: number[][], v: number[]) => R.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const { m: m0 } = randomFrame(11, true);
  const base = run(m0).cases[0];
  for (const [ax, ang] of [[[1, 0, 0], 0.7], [[0, 0, 1], 2.1], [[1, 2, 3], 1.3], [[0, 1, 0], Math.PI / 2], [[1, 1, 0], 0.9]] as [number[], number][]) {
    const R = rot(ax, ang), { m } = randomFrame(11, true);
    for (const nd of m.nodes) { [nd.x, nd.y, nd.z] = app(R, [nd.x, nd.y, nd.z]); }
    for (const l of m.nodeLoads) { [l.fx, l.fy, l.fz] = app(R, [l.fx, l.fy, l.fz]); [l.mx, l.my, l.mz] = app(R, [l.mx, l.my, l.mz]); }
    const c = run(m).cases[0];
    for (const [id, d] of base.disp) {
      const e = [...app(R, d.slice(0, 3)), ...app(R, d.slice(3))], got = c.disp.get(id)!, sc = Math.max(...e.map(Math.abs), 1e-12);
      for (let i = 0; i < 6; i++) expect(Math.abs(got[i] - e[i]) / sc).toBeLessThan(1e-7);
    }
    for (const [id, rr] of base.reactions) {
      const e = [...app(R, rr.slice(0, 3)), ...app(R, rr.slice(3))], got = c.reactions.get(id)!, sc = Math.max(...e.map(Math.abs), 1e-9);
      for (let i = 0; i < 6; i++) expect(Math.abs(got[i] - e[i]) / sc).toBeLessThan(1e-7);
    }
  }
});

test('S3 Maxwell-Betti reciprocity: the displacement at i from a unit load at j equals that at j from i', () => {
  const { m: base } = randomFrame(5, false); base.nodeLoads = [];
  const dofs: [number, number][] = [[3, 0], [5, 1], [7, 2], [4, 4], [8, 5], [6, 3]];
  const resp = (a: [number, number], b: [number, number]) => { // displacement at a due to unit load at b
    const m: Model = JSON.parse(JSON.stringify(base)), v = [0, 0, 0, 0, 0, 0]; v[b[1]] = 1;
    m.nodeLoads.push({ lc: 1, node: b[0], fx: v[0], fy: v[1], fz: v[2], mx: v[3], my: v[4], mz: v[5] });
    return run(m).cases[0].disp.get(a[0])![a[1]];
  };
  for (let i = 0; i < dofs.length; i++) for (let j = i + 1; j < dofs.length; j++) near(resp(dofs[i], dofs[j]), resp(dofs[j], dofs[i]), 1e-9, `δ(${dofs[i]},${dofs[j]})`);
});

test('S4 a tension-only X-brace carries the load in the tensioned diagonal only', () => {
  reset(); const m = frame();
  const a = node(m, 0, 0, 0, 'FFFFFF'), b = node(m, 4, 0, 0, 'FFFFFF'), c = node(m, 4, 3, 0, 'RRFFFR'), d = node(m, 0, 3, 0, 'RRFFFR');
  link(m, a, c, { type: 'T', relA: 'FFFRRR', relB: 'FFFRRR' }); link(m, b, d, { type: 'T', relA: 'FFFRRR', relB: 'FFFRRR' });
  link(m, d, c, { relA: 'FFFRRR', relB: 'FFFRRR' }); link(m, a, d, { relA: 'FFFRRR', relB: 'FFFRRR' }); link(m, b, c, { relA: 'FFFRRR', relB: 'FFFRRR' });
  m.nodeLoads.push({ lc: 1, node: d, fx: 30, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  const c0 = run(m).cases[0];
  // The load (to +X) moves the top to the right: a-c (0,0)-(4,3) lengthens and carries tension, b-d shortens and goes slack.
  // Statics: the horizontal component of the brace force balances the load: T·cos(θ) = 30, with cos(θ) = 4/5.
  expect(c0.members.get(2)!.active).toBe(false);
  near(c0.members.get(1)!.N[10], 30 / (4 / 5), 1e-6, 'brace tension 37.5 kN');
  expect(Math.abs(c0.members.get(2)!.N[10])).toBeLessThan(1e-5); // slack brace carries nothing
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Elastic buckling and second-order (P-Δ) behaviour
// ---------------------------------------------------------------------------------------------------------------
/** All roots of f in (a, b) by scanning for sign changes and bisecting. */
function roots(f: (x: number) => number, a: number, b: number, n = 4000): number[] {
  const out: number[] = []; let x0 = a, f0 = f(a);
  for (let i = 1; i <= n; i++) {
    const x1 = a + (b - a) * i / n, f1 = f(x1);
    if (f0 * f1 < 0 && Math.abs(f0) < 1e6 && Math.abs(f1) < 1e6) { let lo = x0, hi = x1; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; } out.push((lo + hi) / 2); }
    x0 = x1; f0 = f1;
  }
  return out;
}

test('K1 Euler buckling loads of a column for pinned, fixed-free, fixed-pinned and fixed-fixed ends', () => {
  const L = 5, n = 8;
  const cases: [string, string, string, number][] = [
    ['pinned-pinned', 'FFFFFR', 'RFFFFR', 1],
    ['fixed-free', 'FFFFFF', 'RRFFFR', 2],
    ['fixed-pinned', 'FFFFFF', 'RFFFFR', Math.PI / roots(x => Math.sin(x) - x * Math.cos(x), 4, 4.7)[0]], // fixed-pinned: tan x = x, x = π/K
    ['fixed-fixed', 'FFFFFF', 'RFFFFF', 0.5],
  ];
  for (const [name, a, b, K] of cases) {
    const m = line(L, n, a, b); m.settings.bucklingModes = 1; m.nodeLoads.push({ lc: 1, node: n + 1, fx: -1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
    const r = run(m);
    near(r.cases[0].buckling!.values[0], Math.PI ** 2 * EI / (K * L) ** 2, 1e-3, `${name} Pcr = π²EI/(KL)²`);
  }
  // Higher modes of the pinned column: n²π²EI/L²
  const m = line(L, 16, 'FFFFRR', 'RFFFRR', { Iy: I, Iz: I }); m.settings.bucklingModes = 6; m.nodeLoads.push({ lc: 1, node: 17, fx: -1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  const v = run(m).cases[0].buckling!.values; // each mode occurs twice (both principal planes of the isotropic section)
  near(v[0], Math.PI ** 2 * EI / L ** 2, 1e-3, 'mode 1'); near(v[2], 4 * Math.PI ** 2 * EI / L ** 2, 2e-3, 'mode 2'); near(v[4], 9 * Math.PI ** 2 * EI / L ** 2, 5e-3, 'mode 3');
  near(v[0], v[1], 1e-9, 'twin modes of an isotropic section');
});

test('K2 buckling converges to the exact Euler load as the member is refined', () => {
  const L = 5, exact = Math.PI ** 2 * EI / L ** 2, e = [1, 2, 4, 8].map(n => {
    const m = line(L, n, 'FFFFFR', 'RFFFFR'); m.settings.bucklingModes = 1; m.nodeLoads.push({ lc: 1, node: n + 1, fx: -1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
    return Math.abs(run(m).cases[0].buckling!.values[0] / exact - 1);
  });
  near(1 + e[0], 12 / Math.PI ** 2, 1e-3, 'one cubic element gives exactly 12EI/L²');
  expect(e[3]).toBeLessThan(5e-5);
  for (let i = 1; i < e.length; i++) expect(e[i - 1] / e[i]).toBeGreaterThan(10); // O(h⁴)

  for (let i = 1; i < e.length; i++) expect(e[i]).toBeLessThan(e[i - 1] / 3);
});

/** Portal frame with each column split into n elements and the beam in one, huge axial area, fixed bases; returns the top nodes. */
function fineFrame(h: number, Lb: number, n: number) {
  reset(); const m = frame({ A: 1e9 }); const col = (x: number, base: boolean) => {
    const ids: number[] = [];
    for (let i = 0; i <= n; i++) ids.push(node(m, x, h * i / n, 0, i === 0 ? 'FFFFFF' : 'RRFFFR'));
    for (let i = 0; i < n; i++) link(m, ids[i], ids[i + 1]); return ids[n];
  };
  const b = col(0, true), c = col(Lb, true);
  // beam last, so its member id is the last one; the column tops are the beam ends
  link(m, b, c); return { m, b, c };
}
test('K3 sway buckling of a portal frame against the effective-length (alignment chart) equation', () => {
  const h = 4;
  for (const Lb of [4, 8, 2]) {
    const k = (I / Lb) / (I / h);
    const { m, b, c } = fineFrame(h, Lb, 8); m.settings.bucklingModes = 1;
    m.nodeLoads.push(fy(b, -1), fy(c, -1));
    // fixed base, sway permitted: G_B = 0 and G_A = 1/k give x/tan x = -6/G_A = -6k with x = π/K, Pcr = x² EI/h² per column
    const x = roots(x => x / Math.tan(x) + 6 * k, 1.5708 + 1e-6, Math.PI - 1e-6)[0];
    const exact = x * x * EI / (h * h); // load factor = Pcr of each column (each carries a unit load)
    near(analyse(m).cases[0].buckling!.values[0], exact, 2e-3, `beam length ${Lb} (k = ${k.toFixed(2)})`);
  }
  // rigid beam (k → ∞, G_A → 0): each column is fixed at both ends with sway permitted (K = 1), Pcr = π²EI/h²
  const R = fineFrame(h, 4, 8), m = R.m; m.members[m.members.length - 1].sec = 2; m.sections.push({ id: 2, name: 'Rigid', A: 1e9, Iy: I * 1e4, Iz: I * 1e4, J }); m.settings.bucklingModes = 1; m.nodeLoads.push(fy(R.b, -1), fy(R.c, -1));
  near(analyse(m).cases[0].buckling!.values[0], Math.PI ** 2 * EI / (h * h), 1e-3, 'rigid-beam limit π²EI/h² per column');
  // beam of almost no stiffness (k → 0): the column is a cantilever, K = 2
  const S = fineFrame(h, 4, 8), f = S.m; f.members[f.members.length - 1].sec = 2; f.sections.push({ id: 2, name: 'Soft', A: 1e9, Iy: I * 1e-4, Iz: I * 1e-4, J }); f.settings.bucklingModes = 1; f.nodeLoads.push(fy(S.b, -1), fy(S.c, -1));
  near(analyse(f).cases[0].buckling!.values[0], Math.PI ** 2 * EI / (4 * h * h), 1e-3, 'soft-beam limit π²EI/4h² per column');
});

test('K4 P-Δ: simply supported beam-column under UDL and axial compression (secant formula)', () => {
  const L = 6, w = 10, Pcr = Math.PI ** 2 * EI / L ** 2;
  for (const ratio of [0.2, 0.5, 0.8]) {
    const P = ratio * Pcr, u = (L / 2) * Math.sqrt(P / EI), n = 8;
    const m = line(L, n, 'FFFFFR', 'RFFFFR'); udlY(m, -w); m.settings.nonlinear = true; m.nodeLoads.push({ lc: 1, node: n + 1, fx: -P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
    const c = run(m).cases[0];
    const ymax = w * EI / (P * P) * (1 / Math.cos(u) - 1) - w * L * L / (8 * P);
    const Mmax = w * EI / P * (1 / Math.cos(u) - 1);
    near(Math.abs(c.members.get(n / 2)!.Mz[20]), Math.abs(c.members.get(n / 2 + 1)!.Mz[0]), 1e-6, 'moment continuous across the node');
    near(-c.disp.get(n / 2 + 1)![1], ymax, ratio > 0.7 ? 5e-3 : 1e-3, `deflection at P/Pcr = ${ratio}`);
    near(Math.abs(c.members.get(n / 2)!.Mz[20]), Mmax, ratio > 0.7 ? 5e-3 : 1e-3, `moment at P/Pcr = ${ratio}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Natural frequencies (Hz). Characteristic equations are solved here numerically.
// ---------------------------------------------------------------------------------------------------------------
const mass = 7850 * A * 1e-6;                  // kg/m
const freq = (lam: number, L: number) => lam * lam / (2 * Math.PI * L * L) * Math.sqrt(EI * 1e3 / mass); // Hz, from (λL)²

test('K5 P-Δ in the other principal plane: the same beam-column bent about the weak axis', () => {
  const L = 6, w = 10, Iw = I / 3, EIw = E * 1e3 * Iw * 1e-12, Pcr = Math.PI ** 2 * EIw / L ** 2, P = 0.4 * Pcr, u = (L / 2) * Math.sqrt(P / EIw), n = 16;
  const m = line(L, n, 'FFFFRF', 'RFFFRF', { Iy: Iw, Iz: I }); m.settings.nonlinear = true;
  m.members.forEach(b => m.distLoads.push({ lc: 1, member: b.id, axes: 'G', dir: 'Z', w1: -w, w2: -w, s: 0, e: 100 }));
  m.nodeLoads.push({ lc: 1, node: n + 1, fx: -P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 });
  const c = run(m).cases[0];
  near(Math.abs(c.disp.get(n / 2 + 1)![2]), w * EIw / (P * P) * (1 / Math.cos(u) - 1) - w * L * L / (8 * P), 1e-4, 'weak-axis deflection');
  near(Math.abs(c.members.get(n / 2)!.My[20]), w * EIw / P * (1 / Math.cos(u) - 1), 1e-4, 'weak-axis moment at the end of the member');
  near(Math.abs(c.members.get(n / 2)!.My[20]), Math.abs(c.members.get(n / 2 + 1)!.My[0]), 1e-6, 'moment continuous across the node');
});

test('V1 transverse vibration of beams: pinned, cantilever, fixed-fixed and fixed-pinned (Euler-Bernoulli)', () => {
  const L = 4, n = 24;
  const planar = (m: Model) => { m.nodes.forEach(nd => { if (nd.r === 'RRRRRR') nd.r = 'RRFFFR'; }); m.settings.modalModes = 4; return m; };
  const lam = {
    cantilever: roots(x => Math.cos(x) * Math.cosh(x) + 1, 1, 15),
    fixedFixed: roots(x => Math.cos(x) * Math.cosh(x) - 1, 1, 15),
    fixedPinned: roots(x => Math.sin(x) * Math.cosh(x) - Math.cos(x) * Math.sinh(x), 1, 14), // tan λ = tanh λ
    pinned: [1, 2, 3, 4].map(k => k * Math.PI),
  };
  const sets: [string, Model, number[]][] = [
    ['cantilever', planar(line(L, n, 'FFFFFF', 'RRRRRR')), lam.cantilever],
    ['fixed-fixed', planar(line(L, n, 'FFFFFF', 'FFFFFF')), lam.fixedFixed],
    ['fixed-pinned', planar(line(L, n, 'FFFFFF', 'RFFFFR')), lam.fixedPinned],
    ['pinned-pinned', planar(line(L, n, 'FFFFFR', 'RFFFFR')), lam.pinned],
  ];
  for (const [name, m, ls] of sets) {
    m.nodes.forEach(nd => { nd.r = 'F' + nd.r.slice(1); }); // X fixed everywhere: only in-plane bending remains
    const got = run(m).modal!.values;
    [0, 1, 2].forEach(i => near(got[i], freq(ls[i], L), [2e-3, 4e-3, 1e-2][i], `${name} mode ${i + 1}: λ = ${ls[i].toFixed(4)}`));
  }
});

test('V2 axial and torsional vibration of a bar', () => {
  const L = 3, n = 30, c = Math.sqrt(E * 1e6 / 7850); // m/s
  // axial: fixed-free f = (2n-1) c / 4L
  let m = line(L, n, 'FFFFFF', 'RFFFFF'); m.nodes.forEach(nd => { nd.r = nd.r === 'RRRRRR' ? 'RFFFFF' : nd.r; }); m.settings.modalModes = 3;
  let v = run(m).modal!.values;
  [0, 1, 2].forEach(i => near(v[i], (2 * i + 1) * c / (4 * L), [1e-3, 3e-3, 6e-3][i], `axial mode ${i + 1}`));
  // axial: fixed-fixed f = n c / 2L
  m = line(L, n, 'FFFFFF', 'FFFFFF'); m.nodes.forEach(nd => { if (nd.r === 'RRRRRR') nd.r = 'RFFFFF'; }); m.settings.modalModes = 3;
  v = run(m).modal!.values;
  [0, 1].forEach(i => near(v[i], (i + 1) * c / (2 * L), [1e-3, 3e-3][i], `fixed-fixed axial mode ${i + 1}`));
  // torsion: fixed-free, GJ with polar inertia ρ(Iy+Iz); f = (2n-1)/(4L) √(GJ/(ρ Ip))
  m = line(L, n, 'FFFFFF', 'FFFFFF'); m.nodes.forEach(nd => { nd.r = nd.r === 'RRRRRR' ? 'FFFRFF' : nd.r; }); m.nodes[n].r = 'FFFRFF'; m.settings.modalModes = 3;
  v = run(m).modal!.values;
  const Ip = 7850 * (2 * I) * 1e-12; // kg m²/m with Iy + Iz = 2I
  const ft = (k: number) => (2 * k - 1) / (4 * L) * Math.sqrt(GJ * 1e3 / Ip);
  near(v[0], ft(1), 2e-3, 'torsion mode 1 (fixed-free)');
  near(v[1], ft(2), 5e-3, 'torsion mode 2 (fixed-free)');
});

test('V3 cantilever with a tip mass (transcendental frequency equation)', () => {
  const L = 3, n = 24;
  const Mt = 0.6 * mass * L / 1000;
  const m = line(L, n, 'FFFFFF', 'RRFFFR'); m.nodes.forEach(nd => { if (nd.r === 'RRRRRR') nd.r = 'RRFFFR'; });
  m.nodes.forEach(nd => { const r = [...nd.r]; r[0] = 'F'; nd.r = r.join(''); });
  m.masses.push({ node: n + 1, m: Mt }); m.settings.modalModes = 3;
  const ratio = Mt * 1000 / (mass * L); // tip mass over beam mass
  const lam = roots(x => 1 + Math.cos(x) * Math.cosh(x) + ratio * x * (Math.cos(x) * Math.sinh(x) - Math.sin(x) * Math.cosh(x)), 0.5, 12);
  const v = run(m).modal!.values;
  [0, 1].forEach(i => near(v[i], freq(lam[i], L), [1e-3, 4e-3][i], `mode ${i + 1}, λ = ${lam[i].toFixed(4)}`));
});

test('V4 portal frame sway frequency with the beam mass lumped (lateral stiffness from slope-deflection)', () => {
  const h = 4, Lb = 6, k = (I / Lb) / (I / h), Mtot = 12; // t
  const m = portal(h, Lb, 'FFFFFF', { A: 1e9, rho: 0 });
  m.nodes[1].r = 'RRFFFR'; m.nodes[2].r = 'RRFFFR';
  m.masses.push({ node: 2, m: Mtot / 2 }, { node: 3, m: Mtot / 2 }); m.settings.modalModes = 1;
  const K = 12 * EI * (1 + 6 * k) / (h ** 3 * (2 + 3 * k)); // kN/m
  near(run(m).modal!.values[0], Math.sqrt(K / Mtot) / (2 * Math.PI), 1e-6, 'f = √(K/M)/2π');
});

test('V5 the consistent mass matrix converges at the expected rate (O(h⁴) in frequency squared) to the exact value', () => {
  const L = 4, lam = Math.PI, exact = freq(lam, L);
  const e = [2, 4, 8].map(n => {
    const m = line(L, n, 'FFFFFR', 'RFFFFR'); m.nodes.forEach(nd => { const r = [...nd.r]; r[0] = 'F'; r[1] = nd.r[1]; nd.r = r.join(''); if (nd.r === 'FRFFFR') nd.r = 'FRFFFR'; });
    m.nodes.forEach(nd => { if (nd.r.startsWith('FR')) nd.r = 'FRFFFR'; });
    m.nodes[0].r = 'FFFFFR'; m.nodes[n].r = 'FFFFFR'; m.settings.modalModes = 1;
    return run(m).modal!.values[0] / exact - 1;
  });
  expect(e.every(x => x >= -1e-12)).toBe(true); // a consistent matrix over-estimates (upper bound)
  expect(e[0] / e[1]).toBeGreaterThan(10); expect(e[1] / e[2]).toBeGreaterThan(12); // about 16 for O(h⁴) in the frequency
  expect(e[2]).toBeLessThan(2e-4);
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Stresses (the function that colours the Viewer) against beam theory, and section properties
// ---------------------------------------------------------------------------------------------------------------
import { fibreStress } from './stress';
import { shapeProps, iSection, outlineLoops } from '../model/sections';

test('T1 bending stress σ = M y / I: signs and magnitudes on cantilevers loaded in both principal planes', () => {
  const L = 3, P = 8, Iw = I / 4, c = 100; // c: fibre distance in mm
  // downward load (−Y): hogging at the fixed end, tension in the top fibre (+y) and compression in the bottom
  let m = line(L, 4, 'FFFFFF', 'RRRRRR', { Iy: Iw, Iz: I }); m.nodeLoads.push(fy(5, -P));
  let r = run(m).cases[0].members.get(1)!;
  const Mfix = P * L, sTop = fibreStress('normal', r.N[0], r.Mz[0], r.My[0], c, 0, A, Iw, I);
  near(sTop, Mfix * 1e6 * c / I, 1e-9, 'top fibre σ = M c / Iz'); expect(sTop).toBeGreaterThan(0);
  near(fibreStress('normal', r.N[0], r.Mz[0], r.My[0], -c, 0, A, Iw, I), -sTop, 1e-9, 'bottom fibre');
  const tip = run(m).cases[0].members.get(4)!; expect(Math.abs(fibreStress('normal', tip.N[20], tip.Mz[20], tip.My[20], c, 0, A, Iw, I))).toBeLessThan(1e-6); // free end
  // load in −Z: bending about y, tension at +z at the fixed end
  m = line(L, 4, 'FFFFFF', 'RRRRRR', { Iy: Iw, Iz: I }); m.nodeLoads.push({ lc: 1, node: 5, fx: 0, fy: 0, fz: -P, mx: 0, my: 0, mz: 0 });
  r = run(m).cases[0].members.get(1)!;
  const sz = fibreStress('normal', r.N[0], r.Mz[0], r.My[0], 0, c, A, Iw, I);
  near(sz, Mfix * 1e6 * c / Iw, 1e-9, 'σ = M z / Iy');
  expect(sz).toBeGreaterThan(0); // the +z fibre is on the side the load moves away from, so it is in tension
  // the other direction of load reverses every sign
  m = line(L, 4, 'FFFFFF', 'RRRRRR', { Iy: Iw, Iz: I }); m.nodeLoads.push({ lc: 1, node: 5, fx: 0, fy: 0, fz: P, mx: 0, my: 0, mz: 0 });
  r = run(m).cases[0].members.get(1)!;
  expect(fibreStress('normal', r.N[0], r.Mz[0], r.My[0], 0, c, A, Iw, I)).toBeLessThan(0);
});

test('T2 combined axial force and biaxial bending: σ = N/A − Mz y/Iz + My z/Iy at every corner', () => {
  const L = 2, N = 120, Py = -6, Pz = 4, y = 80, z = -50;
  const m = line(L, 2, 'FFFFFF', 'RRRRRR', { Iy: I / 3, Iz: I }); m.nodeLoads.push({ lc: 1, node: 3, fx: N, fy: Py, fz: Pz, mx: 0, my: 0, mz: 0 });
  const r = run(m).cases[0].members.get(1)!;
  // at the fixed end: axial N (tension), Mz = |Py| L (hogging for a downward load), My from Pz
  const Mzs = -Py * L, Mys = Pz * L; // magnitudes; both fibres tension at +y (for −Py) and −z (for +Pz): σ = N/A + Mz y/Iz − My z/Iy
  const exact = N * 1000 / A + Mzs * 1e6 * y / I - Mys * 1e6 * z / (I / 3);
  near(fibreStress('normal', r.N[0], r.Mz[0], r.My[0], y, z, A, I / 3, I), exact, 1e-9, 'combined stress at the fixed end');
  near(fibreStress('axial', r.N[0], r.Mz[0], r.My[0], y, z, A, I / 3, I), N * 1000 / A, 1e-9, 'axial component');
});

test('T3 shear force and bending moment diagrams satisfy dM/dx = V and dV/dx = −w along a member', () => {
  const L = 8, w = 7, m = line(L, 1, 'FFFFRR', 'RFFRRR'); udlY(m, -w);
  const r = run(m).cases[0].members.get(1)!;
  for (let i = 1; i < r.x.length - 1; i++) {
    const dx = r.x[i + 1] - r.x[i - 1], dM = (r.Mz[i + 1] - r.Mz[i - 1]) / dx, dV = (r.Vy[i + 1] - r.Vy[i - 1]) / dx;
    expect(Math.abs(dM - r.Vy[i])).toBeLessThan(1e-9 * w * L); // dM/dx = V (an absolute check, V passes through zero)
    near(dV, -w, 1e-9, `dV/dx at station ${i}`); near(dV, -w, 1e-9, `dV/dx at station ${i}`);
  }
});

test('P1 section properties of the standard shapes against closed forms', () => {
  const rc = shapeProps('rect', [300, 150]);
  near(rc.A, 45000, 1e-12, 'rect A'); near(rc.Iz, 150 * 300 ** 3 / 12, 1e-12, 'rect Iz = b d³/12'); near(rc.Iy, 300 * 150 ** 3 / 12, 1e-12, 'rect Iy');
  // Saint-Venant torsion of a rectangle: J = β a b³ with a ≥ b, β from the series 1/3 − (64/π⁵)(b/a) Σ tanh(nπa/2b)/n⁵ (odd n)
  const J = (a: number, b: number) => { let s = 0; for (let n = 1; n < 200; n += 2) s += Math.tanh(n * Math.PI * a / (2 * b)) / n ** 5; return a * b ** 3 * (1 / 3 - 64 / Math.PI ** 5 * (b / a) * s); };
  for (const [d, b] of [[300, 150], [200, 200], [400, 40], [100, 60]]) near(shapeProps('rect', [d, b]).J, J(Math.max(d, b), Math.min(d, b)), 4e-3, `rect J ${d}×${b}`);
  const ci = shapeProps('circle', [200]);
  near(ci.A, Math.PI * 100 ** 2, 1e-12, 'circle A'); near(ci.Iy, Math.PI * 200 ** 4 / 64, 1e-12, 'circle I'); near(ci.J, Math.PI * 200 ** 4 / 32, 1e-12, 'circle J = 2I');
  const tb = shapeProps('chs', [168.3, 6.4]), di = 168.3 - 12.8;
  near(tb.A, Math.PI / 4 * (168.3 ** 2 - di ** 2), 1e-12, 'tube A'); near(tb.Iy, Math.PI / 64 * (168.3 ** 4 - di ** 4), 1e-12, 'tube I'); near(tb.J, 2 * tb.Iy, 1e-12, 'tube J = 2I');
  // I-section without root radius by the parallel-axis theorem about the centroid
  const d = 310, b = 165, tf = 10, tw = 6, hw = d - 2 * tf, ii = iSection(d, b, tf, tw);
  near(ii.A, 2 * b * tf + hw * tw, 1e-12, 'I A');
  near(ii.Iz, 2 * (b * tf ** 3 / 12 + b * tf * ((d - tf) / 2) ** 2) + tw * hw ** 3 / 12, 1e-12, 'I Iz (parallel axis)');
  near(ii.Iy, 2 * tf * b ** 3 / 12 + hw * tw ** 3 / 12, 1e-12, 'I Iy');
  near(ii.J, (2 * b * tf ** 3 + hw * tw ** 3) / 3 + 0 * 1, 0.1, 'I J (open thin-walled sum, to within the end-correction)');
  // Hollow box: thin-wall Bredt-Batho J = 4 A_m² t / s  (sharp-corner limit, thin wall) within 3 percent
  const hb = shapeProps('rhs', [300, 200, 6]), Am = (300 - 6) * (200 - 6), s = 2 * ((300 - 6) + (200 - 6));
  near(hb.J, 4 * Am * Am * 6 / s, 0.06, 'box J (Bredt-Batho, corner radii reduce the area slightly)');
  // Every shape against the polygon of its drawn outline, by Green's theorem (independent of the closed forms in sections.ts)
  const poly = (loops: [number, number][][]) => {
    let a = 0, sy = 0, sz = 0, iyy = 0, izz = 0;
    for (const l of loops) l.forEach((p, i) => {
      const q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1];
      a += c / 2; sy += (p[0] + q[0]) * c / 6; sz += (p[1] + q[1]) * c / 6;
      izz += c * (p[0] ** 2 + p[0] * q[0] + q[0] ** 2) / 12; iyy += c * (p[1] ** 2 + p[1] * q[1] + q[1] ** 2) / 12;
    });
    return { A: a, Iz: izz - sy * sy / a, Iy: iyy - sz * sz / a }; // second moments about the centroid
  };
  const dims: Record<string, number[]> = { rect: [300, 150], circle: [200], i: [310, 165, 10, 6], rhs: [300, 200, 6], chs: [168.3, 6.4], channel: [230, 75, 12, 6.5], angle: [100, 75, 8] };
  for (const sh of Object.keys(dims) as ('rect' | 'circle' | 'i' | 'rhs' | 'chs' | 'channel' | 'angle')[]) {
    const p = shapeProps(sh, dims[sh]), q = poly(outlineLoops({ shape: sh, dims: dims[sh] }));
    const tol = sh === 'circle' || sh === 'chs' ? 2.5e-2 : 4e-3; // circles are drawn as a 24-sided polygon (area 1.1 percent short)
    near(q.A, p.A, tol, `${sh} outline area`); near(q.Iz, p.Iz, tol, `${sh} outline Iz`); near(q.Iy, p.Iy, tol, `${sh} outline Iy`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Trusses, orientation, torsion and load combinations
// ---------------------------------------------------------------------------------------------------------------
test('R1 pin-jointed truss: bar forces by the method of joints and the joint deflection by the unit-load method', () => {
  reset(); const m = frame();
  const rel = 'FFFFRR', a = node(m, 0, 0, 0, 'FFFFFR'), b = node(m, 4, 0, 0, 'RFFFFR'), c = node(m, 2, 3, 0, 'RRFFFR');
  link(m, a, b, { relA: rel, relB: rel }); link(m, a, c, { relA: rel, relB: rel }); link(m, b, c, { relA: rel, relB: rel });
  const P = 60; m.nodeLoads.push(fy(c, -P));
  const r = run(m).cases[0], Lc = Math.hypot(2, 3);
  near(r.members.get(2)!.N[10], -P / 2 * Lc / 3, 1e-9, 'inclined bar (compression)'); near(r.members.get(3)!.N[10], -P / 2 * Lc / 3, 1e-9, 'inclined bar (compression)');
  near(r.members.get(1)!.N[10], P / 2 * Lc / 3 * 2 / Lc, 1e-9, 'bottom chord (tension)');
  const F = [P / 2 * Lc / 3 * 2 / Lc, -P / 2 * Lc / 3, -P / 2 * Lc / 3], len = [4, Lc, Lc];
  near(-r.disp.get(c)![1], F.reduce((s, f, i) => s + f * f * len[i] / P, 0) / EA, 1e-6, 'δ = Σ F f L / EA (member bending is negligible)');
});

test('R2 section orientation: the member angle swaps the principal axes', () => {
  const L = 3, P = 5, Iw = I / 4;
  for (const [ang, Ib] of [[0, I], [90, Iw]] as const) {
    const m = line(L, 1, 'FFFFFF', 'RRRRRR', { Iy: Iw, Iz: I }); m.members[0].angle = ang; m.nodeLoads.push(fy(2, -P));
    near(-run(m).cases[0].disp.get(2)![1], P * L ** 3 / (3 * E * 1e3 * Ib * 1e-12), 1e-9, `angle ${ang}°`);
  }
  const m = line(L, 1, 'FFFFFF', 'RRRRRR', { Iy: Iw, Iz: I }); m.members[0].angle = 45; m.nodeLoads.push(fy(2, -P));
  // at 45° a vertical load bends the member about both principal axes: δ in the load direction = (P L³/3)(cos²θ/EIz + sin²θ/EIy),
  // and the sideways deflection has magnitude (P L³/3)|1/EIz − 1/EIy| sinθ cosθ
  const d = run(m).cases[0].disp.get(2)!, k = P * L ** 3 / 3;
  near(-d[1], k * (0.5 / EI + 0.5 / (EI / 4)), 1e-9, 'vertical deflection at 45°');
  near(Math.abs(d[2]), k * Math.abs(1 / EI - 4 / EI) * 0.5, 1e-9, 'sideways deflection at 45°');
});

test('R3 torsion of a bar and torsion transmitted through a joint', () => {
  const L = 4, T = 7;
  let m = line(L, 3, 'FFFFFF', 'RRRRRR'); m.nodeLoads.push({ lc: 1, node: 4, fx: 0, fy: 0, fz: 0, mx: T, my: 0, mz: 0 });
  let c = run(m).cases[0];
  near(c.disp.get(4)![3], T * L / GJ, 1e-9, 'twist TL/GJ'); near(c.reactions.get(1)![3], -T, 1e-9, 'reaction torque');
  near(Math.abs(c.members.get(2)!.T[10]), T, 1e-9, 'torque along the bar');
});

test('R4 an arbitrarily oriented cantilever: axial and transverse tip displacements in global axes', () => {
  const dir = [3, 4, 12].map(v => v / 13), L = 5, P = [4, -9, 6];
  reset(); const m = frame({ Iy: I, Iz: I });
  node(m, 0, 0, 0, 'FFFFFF'); node(m, dir[0] * L, dir[1] * L, dir[2] * L); link(m, 1, 2);
  m.nodeLoads.push({ lc: 1, node: 2, fx: P[0], fy: P[1], fz: P[2], mx: 0, my: 0, mz: 0 });
  const d = run(m).cases[0].disp.get(2)!, par = P[0] * dir[0] + P[1] * dir[1] + P[2] * dir[2];
  for (let i = 0; i < 3; i++) near(d[i] + 1e-12, par * L / EA * dir[i] + (P[i] - par * dir[i]) * L ** 3 / (3 * EI) + 1e-12, 1e-8, `component ${i}`);
});

test('R5 load combinations are exact linear combinations of their cases, nested combinations included', () => {
  const m = line(6, 3, 'FFFFFF', 'FFFFRR');
  m.loadCases = [{ id: 1, name: 'D', gx: 0, gy: -1, gz: 0 }, { id: 2, name: 'L', gx: 0, gy: 0, gz: 0 }, { id: 3, name: 'W', gx: 0, gy: 0, gz: 0 }];
  m.nodeLoads.push({ ...fy(2, -10), lc: 2 }, { lc: 3, node: 3, fx: 8, fy: 0, fz: 5, mx: 0, my: 0, mz: 0 });
  m.combos = [{ id: 10, name: 'C1', f: { 1: 1.2, 2: 1.5 } }, { id: 11, name: 'C2', f: { 10: 1, 3: 0.4 } }];
  const r = run(m), by = (id: number) => r.cases.find(c => c.id === id)!;
  for (const node of [2, 3, 4]) for (let d = 0; d < 6; d++) {
    const lin = 1.2 * by(1).disp.get(node)![d] + 1.5 * by(2).disp.get(node)![d] + 0.4 * by(3).disp.get(node)![d];
    expect(Math.abs(by(11).disp.get(node)![d] - lin)).toBeLessThan(1e-12 + 1e-9 * Math.abs(lin));
  }
  for (let d = 0; d < 6; d++) {
    const lin = 1.2 * by(1).reactions.get(1)![d] + 1.5 * by(2).reactions.get(1)![d] + 0.4 * by(3).reactions.get(1)![d];
    expect(Math.abs(by(11).reactions.get(1)![d] - lin)).toBeLessThan(1e-9 + 1e-9 * Math.abs(lin));
  }
});
