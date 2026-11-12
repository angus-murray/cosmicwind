/** Parametric starting models. */
import { emptyModel, type Model, type Section } from './types';
import { LIBRARY } from './sections';

export interface Template { key: string; label: string; params: { key: string; label: string; value: number; min?: number; step?: number }[]; build: (p: Record<string, number>) => Model }

const lib = (id: number, name: string): Section => { const s = LIBRARY.find(l => l.name === name)!; return { id, name, A: Math.round(s.A), Iy: Math.round(s.Iy), Iz: Math.round(s.Iz), J: Math.round(s.J) }; };
const P2 = 'RRFFFR'; // free node of a frame in the XY plane
const round = (v: number) => Math.round(v * 1e6) / 1e6;

function base(title: string, sections: Section[]): Model {
  const m = emptyModel(); m.title = title; m.sections = sections;
  m.loadCases = [{ id: 1, name: 'Dead Load', gx: 0, gy: -1, gz: 0 }, { id: 2, name: 'Live Load', gx: 0, gy: 0, gz: 0 }, { id: 3, name: 'Wind Load', gx: 0, gy: 0, gz: 0 }];
  m.combos = [
    { id: 10, name: '1.35G', f: { 1: 1.35 } }, { id: 11, name: '1.2G + 1.5Q', f: { 1: 1.2, 2: 1.5 } },
    { id: 12, name: '1.2G + Wu + 0.4Q', f: { 1: 1.2, 2: 0.4, 3: 1 } }, { id: 13, name: '0.9G + Wu', f: { 1: 0.9, 3: 1 } },
    { id: 20, name: 'G + 0.7Q (Serviceability)', f: { 1: 1, 2: 0.7 } },
  ];
  return m;
}
const mem = (id: number, a: number, b: number, sec: number, pinned = false) => ({ id, a, b, sec, mat: 1, angle: 0, type: 'N' as const, relA: pinned ? 'FFFFRR' : 'FFFFFF', relB: pinned ? 'FFFFRR' : 'FFFFFF' });
const udl = (lc: number, member: number, w: number) => ({ lc, member, axes: 'G' as const, dir: 'Y' as const, w1: w, w2: w, s: 0, e: 100 });
const nl = (lc: number, node: number, fx: number, fy = 0) => ({ lc, node, fx, fy, fz: 0, mx: 0, my: 0, mz: 0 });

export const TEMPLATES: Template[] = [
  {
    key: 'portal', label: 'Portal Frame',
    params: [{ key: 'span', label: 'Span (m)', value: 20, min: 1 }, { key: 'h', label: 'Eave Height (m)', value: 6, min: 0.5 }, { key: 'pitch', label: 'Roof Pitch (°)', value: 5, min: 0 }, { key: 'fixed', label: 'Fixed Bases (0 or 1)', value: 0, min: 0 }],
    build: p => {
      const m = base('Portal Frame', [lib(1, '360UB50.7'), lib(2, '460UB67.1')]);
      const rise = round(p.span / 2 * Math.tan(p.pitch * Math.PI / 180)), r = p.fixed ? 'FFFFFF' : 'FFFFFR';
      m.nodes = [{ id: 1, x: 0, y: 0, z: 0, r }, { id: 2, x: 0, y: p.h, z: 0, r: P2 }, { id: 3, x: p.span / 2, y: round(p.h + rise), z: 0, r: P2 }, { id: 4, x: p.span, y: p.h, z: 0, r: P2 }, { id: 5, x: p.span, y: 0, z: 0, r }];
      m.members = [mem(1, 1, 2, 2), mem(2, 2, 3, 1), mem(3, 3, 4, 1), mem(4, 5, 4, 2)];
      m.distLoads = [udl(1, 2, -1.5), udl(1, 3, -1.5), udl(2, 2, -2), udl(2, 3, -2),
        { lc: 3, member: 1, axes: 'G', dir: 'X', w1: 3.5, w2: 3.5, s: 0, e: 100 }, { lc: 3, member: 4, axes: 'G', dir: 'X', w1: 2.5, w2: 2.5, s: 0, e: 100 },
        { lc: 3, member: 2, axes: 'L', dir: 'Y', w1: 3, w2: 3, s: 0, e: 100 }, { lc: 3, member: 3, axes: 'L', dir: 'Y', w1: 2, w2: 2, s: 0, e: 100 }];
      return m;
    },
  },
  {
    key: 'frame', label: 'Multi-Storey Frame',
    params: [{ key: 'bays', label: 'Bays in X', value: 3, min: 1 }, { key: 'bw', label: 'Bay Width (m)', value: 6, min: 0.5 }, { key: 'st', label: 'Storeys', value: 3, min: 1 }, { key: 'sh', label: 'Storey Height (m)', value: 3.6, min: 0.5 },
      { key: 'nz', label: 'Frames in Z', value: 2, min: 1 }, { key: 'sz', label: 'Frame Spacing (m)', value: 6, min: 0.5 }],
    build: p => {
      const m = base('Multi-Storey Frame', [lib(1, '310UB40.4'), lib(2, '200UC46.2')]);
      const nx = Math.round(p.bays) + 1, ny = Math.round(p.st) + 1, nz = Math.round(p.nz), id = (i: number, j: number, k: number) => 1 + i + nx * (j + ny * k);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
        m.nodes.push({ id: id(i, j, k), x: round(i * p.bw), y: round(j * p.sh), z: round(k * p.sz), r: j === 0 ? 'FFFFFF' : nz === 1 ? P2 : 'RRRRRR' });
      let n = 1;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (j > 0) m.members.push(mem(n++, id(i, j - 1, k), id(i, j, k), 2));
        if (j > 0 && i > 0) { m.members.push(mem(n, id(i - 1, j, k), id(i, j, k), 1)); m.distLoads.push(udl(1, n, -8), udl(2, n, -10)); n++; }
        if (j > 0 && k > 0) m.members.push(mem(n++, id(i, j, k - 1), id(i, j, k), 1));
      }
      for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) m.nodeLoads.push(nl(3, id(0, j, k), 12 * j));
      return m;
    },
  },
  {
    key: 'truss', label: 'Truss',
    params: [{ key: 'span', label: 'Span (m)', value: 18, min: 1 }, { key: 'depth', label: 'Depth (m)', value: 2, min: 0.2 }, { key: 'panels', label: 'Panels (even)', value: 6, min: 2, step: 2 }],
    build: p => {
      const m = base('Truss', [lib(1, '150×150×6.0 SHS'), lib(2, '100×100×5.0 SHS')]);
      const n = Math.max(2, 2 * Math.round(p.panels / 2)), dx = p.span / n;
      for (let i = 0; i <= n; i++) m.nodes.push({ id: i + 1, x: round(i * dx), y: 0, z: 0, r: i === 0 ? 'FFFFFR' : i === n ? 'RFFFFR' : P2 });
      for (let i = 0; i <= n; i++) m.nodes.push({ id: n + 2 + i, x: round(i * dx), y: p.depth, z: 0, r: P2 });
      let k = 1;
      for (let i = 0; i < n; i++) { m.members.push(mem(k++, i + 1, i + 2, 1), mem(k++, n + 2 + i, n + 3 + i, 1)); }
      for (let i = 0; i <= n; i++) m.members.push(mem(k++, i + 1, n + 2 + i, 2, true));
      for (let i = 0; i < n; i++) m.members.push(i < n / 2 ? mem(k++, n + 2 + i, i + 2, 2, true) : mem(k++, i + 1, n + 3 + i, 2, true));
      for (let i = 0; i <= n; i++) { const f = i === 0 || i === n ? 0.5 : 1; m.nodeLoads.push(nl(1, n + 2 + i, 0, -6 * f), nl(2, n + 2 + i, 0, -9 * f)); }
      m.nodeLoads.push(nl(3, n + 2, 5));
      return m;
    },
  },
  {
    key: 'beam', label: 'Continuous Beam',
    params: [{ key: 'spans', label: 'Spans', value: 3, min: 1 }, { key: 'L', label: 'Span Length (m)', value: 6, min: 0.5 }],
    build: p => {
      const m = base('Continuous Beam', [lib(1, '310UB40.4')]); const n = Math.round(p.spans);
      m.loadCases.pop(); m.combos = m.combos.filter(c => !(3 in c.f));
      for (let i = 0; i <= n; i++) m.nodes.push({ id: i + 1, x: round(i * p.L), y: 0, z: 0, r: i === 0 ? 'FFFFRR' : 'RFFFFR' });
      for (let i = 0; i < n; i++) { m.members.push(mem(i + 1, i + 1, i + 2, 1)); m.distLoads.push(udl(1, i + 1, -5), udl(2, i + 1, -8)); }
      return m;
    },
  },
];

export const defaultModel = () => TEMPLATES[0].build(Object.fromEntries(TEMPLATES[0].params.map(p => [p.key, p.value])));
