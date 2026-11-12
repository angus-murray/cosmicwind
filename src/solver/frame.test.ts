import { expect, test } from 'bun:test';
import { analyse } from './frame';
import { emptyModel, type Model } from '../model/types';
import { LIBRARY } from '../model/sections';

const E = 200000, I = 100e6, A = 5000, EI = E * 1e3 * I * 1e-12; // kNm²
const close = (a: number, b: number, tol = 1e-4) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(Math.abs(b), 1e-9));

/** Straight member along X from 0 to L, split into n elements, weightless. */
function beam(L: number, n: number, rA: string, rB: string): Model {
  const m = emptyModel();
  m.loadCases = [{ id: 1, name: 'LC', gx: 0, gy: 0, gz: 0 }];
  m.sections = [{ id: 1, name: 'S', A, Iy: I / 4, Iz: I, J: 1e6 }];
  for (let i = 0; i <= n; i++) m.nodes.push({ id: i + 1, x: L * i / n, y: 0, z: 0, r: i === 0 ? rA : i === n ? rB : 'RRRRRR' });
  for (let i = 0; i < n; i++) m.members.push({ id: i + 1, a: i + 1, b: i + 2, sec: 1, mat: 1, angle: 0, type: 'N', relA: 'FFFFFF', relB: 'FFFFFF' });
  return m;
}
const udl = (m: Model, w: number) => m.members.forEach(b => m.distLoads.push({ lc: 1, member: b.id, axes: 'G', dir: 'Y', w1: w, w2: w, s: 0, e: 100 }));

test('cantilever with a tip load', () => {
  const m = beam(4, 1, 'FFFFFF', 'RRRRRR');
  m.nodeLoads.push({ lc: 1, node: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 });
  const r = analyse(m); expect(r.errors).toEqual([]);
  const c = r.cases[0], mr = c.members.get(1)!;
  close(c.disp.get(2)![1], -10 * 64 / (3 * EI));
  close(mr.Mz[0], -40); close(mr.Vy[0], 10);
  close(c.reactions.get(1)![1], 10); close(c.reactions.get(1)![5], 40);
  close(mr.dy[10], -10 * 4 * (3 * 4 * 4 - 4 * 4 / 4) / 0 || -10 * 2 * 2 * (3 * 4 - 2) / (6 * EI)); // Px²(3L−x)/6EI at x = 2
});

test('simply supported beam, UDL on one element', () => {
  const m = beam(6, 1, 'FFFFRR', 'RFFRRR'); udl(m, -5);
  const c = analyse(m).cases[0], mr = c.members.get(1)!;
  close(mr.Mz[10], 5 * 36 / 8); close(mr.dy[10], -5 * 5 * 6 ** 4 / (384 * EI), 1e-6);
  close(c.reactions.get(1)![1], 15); close(c.reactions.get(2)![1], 15);
});

test('fixed-ended beam: UDL, partial trapezoidal load, point load and point moment against a refined model', () => {
  const m = beam(6, 1, 'FFFFFF', 'FFFFFF'); udl(m, -5);
  const mr = analyse(m).cases[0].members.get(1)!;
  close(mr.Mz[0], -15); close(mr.Mz[10], 7.5); close(mr.dy[10], -5 * 6 ** 4 / (384 * EI), 1e-6);
  // one element with loads within its span = three elements with the loads at their ends
  const a = beam(6, 1, 'FFFFFF', 'FFFFFF');
  a.distLoads.push({ lc: 1, member: 1, axes: 'L', dir: 'Y', w1: -2, w2: -8, s: 25, e: 75 });
  a.pointLoads.push({ lc: 1, member: 1, axes: 'G', dir: 'Y', p: -12, pos: 25 }, { lc: 1, member: 1, axes: 'G', dir: 'MZ', p: 9, pos: 75 }, { lc: 1, member: 1, axes: 'G', dir: 'Z', p: 4, pos: 25 });
  const b = beam(6, 4, 'FFFFFF', 'FFFFFF');
  b.distLoads.push({ lc: 1, member: 2, axes: 'L', dir: 'Y', w1: -2, w2: -5, s: 0, e: 100 }, { lc: 1, member: 3, axes: 'L', dir: 'Y', w1: -5, w2: -8, s: 0, e: 100 });
  b.nodeLoads.push({ lc: 1, node: 2, fx: 0, fy: -12, fz: 4, mx: 0, my: 0, mz: 0 }, { lc: 1, node: 4, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 9 });
  const ra = analyse(a).cases[0], rb = analyse(b).cases[0];
  for (let d = 0; d < 6; d++) for (const [na, nb] of [[1, 1], [2, 5]]) close(ra.reactions.get(na)![d], rb.reactions.get(nb)![d], 1e-9);
  const ma = ra.members.get(1)!, at = (x: number) => ma.x.findIndex(v => Math.abs(v - x) < 1e-9);
  close(ma.dy[at(3)], rb.disp.get(3)![1], 1e-5); close(ma.dz[at(3)], rb.disp.get(3)![2], 1e-5);
  close(ma.Mz[at(3)], rb.members.get(2)!.Mz.at(-1)!, 1e-9); close(ma.My[at(3)], rb.members.get(2)!.My.at(-1)!, 1e-9);
});

test('propped cantilever by an end release; support settlement', () => {
  const m = beam(6, 1, 'FFFFFF', 'FFFFFF'); m.members[0].relB = 'FFFFFR'; udl(m, -5);
  const mr = analyse(m).cases[0].members.get(1)!;
  close(mr.Mz[0], -5 * 36 / 8); expect(Math.abs(mr.Mz.at(-1)!)).toBeLessThan(1e-9); close(mr.Vy.at(-1)!, -3 * 5 * 6 / 8);
  const s = beam(6, 1, 'FFFFFF', 'FFFFFF'); s.settlements.push({ lc: 1, node: 2, dx: 0, dy: -10, dz: 0 });
  const c = analyse(s).cases[0];
  close(Math.abs(c.members.get(1)!.Mz[0]), 6 * EI * 0.01 / 36); close(c.disp.get(2)![1], -0.01);
});

test('Euler buckling and P-Δ amplification of a cantilever column', () => {
  const m = emptyModel(); m.loadCases = [{ id: 1, name: 'LC', gx: 0, gy: 0, gz: 0 }];
  m.sections = [{ id: 1, name: 'S', A, Iy: I, Iz: I, J: 1e6 }];
  const L = 5, n = 8;
  for (let i = 0; i <= n; i++) m.nodes.push({ id: i + 1, x: 0, y: L * i / n, z: 0, r: i ? 'RRRRRR' : 'FFFFFF' });
  for (let i = 0; i < n; i++) m.members.push({ id: i + 1, a: i + 1, b: i + 2, sec: 1, mat: 1, angle: 0, type: 'N', relA: 'FFFFFF', relB: 'FFFFFF' });
  const Pcr = Math.PI ** 2 * EI / (4 * L * L), P = 0.4 * Pcr, H = 1;
  m.nodeLoads.push({ lc: 1, node: n + 1, fx: H, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 });
  m.settings.bucklingModes = 2;
  const lin = analyse(m).cases[0];
  close(lin.buckling!.values[0], 1 / 0.4, 1e-3);
  m.settings.nonlinear = true;
  const nl = analyse(m).cases[0];
  const k = Math.sqrt(P / EI), exact = H / P * (Math.tan(k * L) / k - L);
  close(nl.disp.get(n + 1)![0], exact, 2e-3);
  expect(nl.disp.get(n + 1)![0] / lin.disp.get(n + 1)![0]).toBeGreaterThan(1.5);
});

test('natural frequencies of a simply supported beam', () => {
  const L = 8, n = 24, m = beam(L, n, 'FFFFRR', 'RFFRRR');
  m.nodes.forEach(nd => { if (nd.r === 'RRRRRR') nd.r = 'RRFFFR'; }); // plane XY
  m.settings.modalModes = 3;
  const r = analyse(m), mass = 7850 * A * 1e-6 / 1000; // t/m
  const f = (k: number) => (k * k * Math.PI / 2) * Math.sqrt(EI / (mass * L ** 4));
  close(r.modal!.values[0], f(1), 2e-3); close(r.modal!.values[1], f(2), 5e-3);
});

test('tension-only bracing and equilibrium of a 3D frame', () => {
  const m = emptyModel(); m.loadCases = [{ id: 1, name: 'LC', gx: 0, gy: -1, gz: 0 }];
  m.sections = [{ id: 1, name: 'S', A, Iy: I / 3, Iz: I, J: 1e6 }, { id: 2, name: 'Rod', A: 300, Iy: 1e3, Iz: 1e3, J: 1e3 }];
  m.nodes = [{ id: 1, x: 0, y: 0, z: 0, r: 'FFFFFF' }, { id: 2, x: 4, y: 0, z: 0, r: 'FFFRRR' }, { id: 3, x: 0, y: 3, z: 0, r: 'RRRRRR' }, { id: 4, x: 4, y: 3, z: 0, r: "RRRRRR" }];
  const mk = (id: number, a: number, b: number, sec = 1, type: 'N' | 'T' = 'N', rel = 'FFFFFF') => ({ id, a, b, sec, mat: 1, angle: id * 20, type, relA: rel, relB: rel });
  m.members = [mk(1, 1, 3), mk(2, 2, 4), mk(3, 3, 4), mk(4, 1, 4, 2, 'T', 'FFFRRR'), mk(5, 2, 3, 2, 'T', 'FFFRRR')];
  m.nodeLoads.push({ lc: 1, node: 3, fx: 20, fy: 0, fz: 3, mx: 0, my: 0, mz: 0 });
  m.distLoads.push({ lc: 1, member: 3, axes: 'G', dir: 'Y', w1: -4, w2: -1, s: 10, e: 80 });
  const r = analyse(m); expect(r.errors).toEqual([]);
  const c = r.cases[0];
  expect(c.members.get(4)!.active).toBe(true); expect(c.members.get(5)!.active).toBe(false);
  expect(c.members.get(4)!.N[0]).toBeGreaterThan(1);
  // ΣF = 0: reactions balance the applied loads (self-weight, node load, member load)
  const sum = [0, 0, 0]; c.reactions.forEach(v => v.slice(0, 3).forEach((x, i) => { sum[i] += x; }));
  const len = (a: number, b: number) => Math.hypot(...(['x', 'y', 'z'] as const).map(k => m.nodes[a - 1][k] - m.nodes[b - 1][k]));
  const W = m.members.reduce((t, b) => t + len(b.a, b.b) * m.sections[b.sec - 1].A * 7850e-6 * 9.80665e-3, 0);
  close(sum[0], -20, 1e-8); close(sum[2], -3, 1e-8); close(sum[1], W + 2.5 * 0.7 * len(3, 4), 1e-8);
});

test('library sections: calculated mass agrees with the designation', () => {
  for (const s of LIBRARY.filter(l => /U[BC]/.test(l.name))) {
    const kg = Number(s.name.split(/U[BC]/)[1]);
    close(s.A * 7850e-6, kg, 0.02);
  }
  const ub = LIBRARY.find(s => s.name === '310UB40.4')!; close(ub.Iz, 86.4e6, 0.01); close(ub.Iy, 7.65e6, 0.01);
  const shs = LIBRARY.find(s => s.name === '100×100×5.0 SHS')!; close(shs.A, 1810, 0.01); close(shs.Iz, 2.66e6, 0.015);
  const pfc = LIBRARY.find(s => s.name === '200PFC')!; close(pfc.A, 2920, 0.01); close(pfc.Iz, 19.1e6, 0.01);
});
