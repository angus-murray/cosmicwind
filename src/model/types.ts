/**
 * CosmicWind model. Units: coordinates m, forces kN, moments kNm, section properties mm-based, E and G in MPa,
 * density kg/m³. Global Y is vertical (up).
 */
export interface Node {
  id: number; x: number; y: number; z: number;
  /** Six characters for DX DY DZ RX RY RZ: F (fixed), R (released) or S (spring); an en-dash means all released. */ r: string;
  /** Spring stiffnesses for the S degrees of freedom: kN/m for DX DY DZ, kNm/rad for RX RY RZ. */ k?: number[];
}
import type { Outline } from './sections';
export interface Section { id: number; name: string; A: number; Iy: number; Iz: number; J: number; /** Nominal shape, for the rendered view only. */ outline?: Outline; /** Colour of its members as #rrggbb; when absent the colour follows the section number. */ colour?: string } // mm², mm⁴
export interface Material { id: number; name: string; E: number; G: number; rho: number; alpha: number } // MPa, MPa, kg/m³, /°C
export type MemberType = 'N' | 'T' | 'C';
export interface Member {
  id: number; a: number; b: number; sec: number; mat: number;
  /** Rotation of the section about the member axis (degrees). */
  angle: number; type: MemberType;
  /** End releases at A and B: six characters for the local Fx Fy Fz Mx My Mz: F (fixed), R (released) or S (spring, not for the shears Fy and Fz);
   *  an en-dash means all fixed. */
  relA: string; relB: string;
  /** Spring stiffnesses of the S end releases: kN/m for Fx, kNm/rad for Mx My Mz. */
  kA?: number[]; kB?: number[];
  /** Continuous support along the member in its local y and z directions, kN/m per m of member length (kN/m/m); absent or 0 means unsupported. */
  ky?: number; kz?: number;
  /** Distributed mass added to the member's own, in t/m (for example cladding): it weighs under gravity and adds mass to the vibration modes. */
  mu?: number;
}
export interface LoadCase { id: number; name: string; /** Gravity load as multipliers of g in global X, Y, Z (self-weight of the members). */ gx: number; gy: number; gz: number }
export interface Combo { id: number; name: string; /** Load case id → factor. */ f: Record<number, number> }
export interface NodeLoad { lc: number; node: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }
export type Axes = 'G' | 'L';
export type Dir = 'X' | 'Y' | 'Z';
export interface DistLoad { lc: number; member: number; axes: Axes; dir: Dir; w1: number; w2: number; /** Start and end, % of length. */ s: number; e: number }
export type PointDir = Dir | 'MX' | 'MY' | 'MZ';
export interface PointLoad { lc: number; member: number; axes: Axes; dir: PointDir; p: number; /** Position, % of length. */ pos: number }
export interface Settlement { lc: number; node: number; dx: number; dy: number; dz: number } // mm, on restrained DOFs
export interface ThermalLoad { lc: number; member: number; dT: number } // °C, uniform
export interface NodeMass { node: number; m: number } // tonnes

/** A note shown as a call-out: text, what it is attached to, and where its box sits (pixels right of and below the anchor, to the box's bottom left). */
export interface Note { id: number; kind: 'node' | 'member'; ref: number; text: string; dx: number; dy: number }

export interface Settings {
  nonlinear: boolean;       // P-Δ (second-order) analysis
  bucklingModes: number;    // 0 = off
  modalModes: number;       // 0 = off
}

export interface Model {
  title: string;
  nodes: Node[]; members: Member[]; sections: Section[]; materials: Material[];
  loadCases: LoadCase[]; combos: Combo[];
  nodeLoads: NodeLoad[]; distLoads: DistLoad[]; pointLoads: PointLoad[]; settlements: Settlement[]; thermal: ThermalLoad[];
  masses: NodeMass[];
  /** Call-outs attached to a node or the midpoint of a member. */
  notes: Note[];
  settings: Settings;
}

/** Shown for a node with no restraint and a member end with no release: the defaults, which are RRRRRR and FFFFFF. */
export const DASH = '–';
export const FREE = DASH, FIXED = 'FFFFFF', PIN = 'FFFRRR';
/** The six-letter restraint code of a node; an en-dash or blank means free. */
export const restraintCode = (r: string | undefined) => (!r || r === DASH ? 'RRRRRR' : r.toUpperCase().padEnd(6, 'R'));
/** The six-letter release code of a member end; an en-dash or blank means rigid. */
export const releaseCode = (r: string | undefined) => (!r || r === DASH ? 'FFFFFF' : r.toUpperCase().padEnd(6, 'F'));
/**
 * Symmetry planes, named by the plane (XY, YZ, ZX: the right-handed cyclic order): the translation normal to the plane and the two rotations about axes
 * in the plane are fixed, as for a node on a plane of symmetry.
 */
export const SYM_XY = 'RRFFFR', SYM_YZ = 'FRRRFF', SYM_ZX = 'RFRFRF';
export const RESTRAINTS: [string, string][] = [[FREE, 'Free'], [FIXED, 'Fixed'], [PIN, 'Pinned'], [SYM_XY, 'XY Symmetry'], [SYM_YZ, 'YZ Symmetry'], [SYM_ZX, 'ZX Symmetry']];
/** The name of a preset restraint code, or the code itself. */
export const restraintName = (c: string) => RESTRAINTS.find(([code]) => code === c)?.[1] ?? c;
export const RELEASES: [string, string][] = [[DASH, 'Rigid'], ['FFFFRR', 'Pinned (My, Mz)'], ['FFFRRR', 'Pinned (All)']];

export const STEEL: Material = { id: 1, name: 'Steel', E: 200000, G: 80000, rho: 7850, alpha: 11.7e-6 };
export const MATERIAL_PRESETS: Omit<Material, 'id'>[] = [
  { name: 'Steel', E: 200000, G: 80000, rho: 7850, alpha: 11.7e-6 },
  { name: 'Concrete 32 MPa', E: 30100, G: 12540, rho: 2400, alpha: 10e-6 },
  { name: 'Concrete 40 MPa', E: 32800, G: 13670, rho: 2400, alpha: 10e-6 },
  { name: 'Concrete 50 MPa', E: 34800, G: 14500, rho: 2400, alpha: 10e-6 },
  { name: 'Aluminium 6061', E: 70000, G: 26000, rho: 2700, alpha: 23e-6 },
  { name: 'Timber MGP10', E: 10000, G: 670, rho: 550, alpha: 4e-6 },
  { name: 'Timber GL17', E: 16700, G: 1110, rho: 650, alpha: 4e-6 },
];

export const DEFAULT_SETTINGS: Settings = { nonlinear: false, bucklingModes: 0, modalModes: 0 };

export const emptyModel = (): Model => ({
  title: 'Untitled', nodes: [], members: [], sections: [], materials: [{ ...STEEL }],
  loadCases: [{ id: 1, name: 'Dead Load', gx: 0, gy: 0, gz: 0 }], combos: [],
  nodeLoads: [], distLoads: [], pointLoads: [], settlements: [], thermal: [], masses: [], notes: [],
  settings: { ...DEFAULT_SETTINGS },
});

export const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

/** Fills in anything missing from a model loaded from a file or storage. */
export function normalise(m: Partial<Model>): Model {
  const e = emptyModel();
  const out = { ...e, ...m, settings: { ...e.settings, ...(m.settings ?? {}) } } as Model;
  for (const k of ['nodes', 'members', 'sections', 'materials', 'loadCases', 'combos', 'nodeLoads', 'distLoads', 'pointLoads', 'settlements', 'thermal', 'masses', 'notes'] as const)
    if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown>)[k] = [];
  // Spring supports used to be a separate list: a spring on a released degree of freedom becomes an S in the restraint code.
  const legacy = (m as { springs?: { node: number; k: number[] }[] }).springs;
  if (Array.isArray(legacy)) out.nodes = out.nodes.map(n => {
    const sp = legacy.find(s => s.node === n.id); if (!sp) return n;
    const r = restraintCode(n.r).split(''), k = [...(n.k ?? [0, 0, 0, 0, 0, 0])];
    sp.k.forEach((v, d) => { if (v > 0 && r[d] === 'R') { r[d] = 'S'; k[d] = v; } });
    return { ...n, r: r.join(''), k };
  });
  delete (out as { springs?: unknown }).springs;
  out.nodes = out.nodes.map(n => (!n.r || n.r === 'RRRRRR' ? { ...n, r: DASH } : n));
  out.members = out.members.map(b => ({ ...b, relA: !b.relA || b.relA === 'FFFFFF' ? DASH : b.relA, relB: !b.relB || b.relB === 'FFFFFF' ? DASH : b.relB }));
  return out;
}

/** Removes a node or member with everything that refers to it. */
export function deleteNodes(m: Model, ids: Set<number>): Model {
  const members = m.members.filter(b => !ids.has(b.a) && !ids.has(b.b));
  const gone = new Set(m.members.filter(b => !members.includes(b)).map(b => b.id));
  return {
    ...deleteMembers({ ...m }, gone),
    nodes: m.nodes.filter(n => !ids.has(n.id)),
    nodeLoads: m.nodeLoads.filter(l => !ids.has(l.node)), settlements: m.settlements.filter(l => !ids.has(l.node)),
    masses: m.masses.filter(l => !ids.has(l.node)),
    notes: m.notes.filter(n => !(n.kind === 'node' && ids.has(n.ref))),
  };
}
export function deleteMembers(m: Model, ids: Set<number>): Model {
  return {
    ...m, members: m.members.filter(b => !ids.has(b.id)),
    distLoads: m.distLoads.filter(l => !ids.has(l.member)), pointLoads: m.pointLoads.filter(l => !ids.has(l.member)),
    thermal: m.thermal.filter(l => !ids.has(l.member)),
    notes: m.notes.filter(n => !(n.kind === 'member' && ids.has(n.ref))),
  };
}

/** Removes members, then any node they leave with no member attached (a node still used by another member stays). */
export function deleteMembersAndFreeNodes(m: Model, ids: Set<number>): Model {
  const ends = new Set(m.members.filter(b => ids.has(b.id)).flatMap(b => [b.a, b.b]));
  const rest = deleteMembers(m, ids), used = new Set(rest.members.flatMap(b => [b.a, b.b]));
  const free = new Set([...ends].filter(n => !used.has(n)));
  return free.size ? deleteNodes(rest, free) : rest;
}

/**
 * Joins colinear members that form one chain into a single member from the first node to the last. The members must be the only ones at the nodes between them,
 * those nodes must carry no restraint, load, mass or settlement, and the members must agree in section, material, angle, type, direction and thermal load.
 * Loads on the members move to the new member (it keeps the lowest member number). Returns the model and the kept member, or the reason it cannot be done.
 */
export function mergeMembers(m: Model, ids: Set<number>): { model: Model; kept: number } | { reason: string } {
  const sel = m.members.filter(b => ids.has(b.id));
  if (sel.length < 2) return { reason: 'Select at least two members.' };
  const node = new Map(m.nodes.map(n => [n.id, n]));
  const deg = new Map<number, number>();
  for (const b of sel) for (const n of [b.a, b.b]) deg.set(n, (deg.get(n) ?? 0) + 1);
  const ends = [...deg].filter(([, d]) => d === 1).map(([n]) => n);
  if (ends.length !== 2 || [...deg.values()].some(d => d > 2)) return { reason: 'The members do not form one chain.' };
  // Walk the chain from one end; the members must all run the same way along it
  const walk = (from: number) => {
    const order: Member[] = [], nodes = [from], left = new Set(sel);
    while (left.size) {
      const cur = nodes[nodes.length - 1], b = [...left].find(x => x.a === cur);
      if (!b) return null;
      left.delete(b); order.push(b); nodes.push(b.b);
    }
    return { order, nodes };
  };
  const chain = walk(ends[0]) ?? walk(ends[1]);
  if (!chain) return { reason: 'The members do not form one chain running in one direction.' };
  const { order, nodes } = chain;
  const p0 = node.get(nodes[0]), p1 = node.get(nodes[nodes.length - 1]);
  if (!p0 || !p1) return { reason: 'A node is missing.' };
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  if (L < 1e-9) return { reason: 'The members form a closed loop.' };
  const u = [(p1.x - p0.x) / L, (p1.y - p0.y) / L, (p1.z - p0.z) / L];
  let prev = 0;
  for (const id of nodes.slice(1, -1)) {
    const n = node.get(id); if (!n) return { reason: 'A node is missing.' };
    const d = [n.x - p0.x, n.y - p0.y, n.z - p0.z], t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const off = Math.hypot(d[0] - t * u[0], d[1] - t * u[1], d[2] - t * u[2]);
    if (off > 1e-6 * Math.max(1, L) || t <= prev) return { reason: 'The members are not colinear.' };
    prev = t;
    if (m.members.some(b => !ids.has(b.id) && (b.a === id || b.b === id))) return { reason: 'Another member is connected at a common node.' };
    if (restraintCode(n.r) !== 'RRRRRR' || m.nodeLoads.some(l => l.node === id) || m.settlements.some(l => l.node === id) || m.masses.some(l => l.node === id))
      return { reason: 'A common node has a restraint, load or mass.' };
  }
  const f = order[0], last = order[order.length - 1];
  if (order.some(b => b.sec !== f.sec || b.mat !== f.mat || b.angle !== f.angle || b.type !== f.type || (b.ky ?? 0) !== (f.ky ?? 0) || (b.kz ?? 0) !== (f.kz ?? 0) || (b.mu ?? 0) !== (f.mu ?? 0))) return { reason: 'The members differ in section, material, angle, type, continuous support or distributed mass.' };
  const lens = order.map(b => { const a = node.get(b.a)!, c = node.get(b.b)!; return Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z); });
  const start = lens.map((_, i) => lens.slice(0, i).reduce((s, v) => s + v, 0));
  const total = lens.reduce((s, v) => s + v, 0), idx = new Map(order.map((b, i) => [b.id, i]));
  const kept = Math.min(...order.map(b => b.id));
  const thermal: ThermalLoad[] = [];
  for (const lc of new Set(m.thermal.filter(t => idx.has(t.member)).map(t => t.lc))) {
    const ts = order.map(b => m.thermal.find(t => t.lc === lc && t.member === b.id)?.dT ?? 0);
    if (ts.some(t => Math.abs(t - ts[0]) > 1e-12)) return { reason: 'The members have different thermal loads.' };
    thermal.push({ lc, member: kept, dT: ts[0] });
  }
  const pct = (i: number, p: number) => +((start[i] + p / 100 * lens[i]) / total * 100).toFixed(6);
  const merged: Member = { ...f, id: kept, a: nodes[0], b: nodes[nodes.length - 1], relA: f.relA, kA: f.kA, relB: last.relB, kB: last.kB };
  const inner = new Set(nodes.slice(1, -1));
  const rest = <T extends { member: number }>(a: T[]) => a.filter(x => !idx.has(x.member));
  const model: Model = {
    ...m,
    nodes: m.nodes.filter(n => !inner.has(n.id)),
    members: m.members.filter(b => !idx.has(b.id)).concat(merged).sort((p, q) => p.id - q.id),
    distLoads: [...rest(m.distLoads), ...m.distLoads.filter(l => idx.has(l.member)).map(l => { const i = idx.get(l.member)!; return { ...l, member: kept, s: pct(i, l.s), e: pct(i, l.e) }; })],
    pointLoads: [...rest(m.pointLoads), ...m.pointLoads.filter(l => idx.has(l.member)).map(l => { const i = idx.get(l.member)!; return { ...l, member: kept, pos: pct(i, l.pos) }; })],
    thermal: [...rest(m.thermal), ...thermal],
    notes: m.notes.filter(n => !(n.kind === 'node' && inner.has(n.ref))).map(n => (n.kind === 'member' && idx.has(n.ref) ? { ...n, ref: kept } : n)),
  };
  return { model, kept };
}

/**
 * Splits the selected members where they cross one another (or where an end of one lies on another), at a node shared by the members. A node already there
 * is used; otherwise a new one is made. Loads stay with the part of the member they act on. Returns the model and the numbers of the members that result
 * from the selected ones, or null when none of them cross.
 */
export function intersectMembers(m: Model, ids: Set<number>): { model: Model; members: Set<number> } | null {
  const node = new Map(m.nodes.map(n => [n.id, n]));
  const sel = m.members.filter(b => ids.has(b.id) && node.has(b.a) && node.has(b.b));
  const seg = new Map(sel.map(b => { const a = node.get(b.a)!, c = node.get(b.b)!; return [b.id, { a, d: [c.x - a.x, c.y - a.y, c.z - a.z], L: Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) }] as const; }));
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const tol = 1e-6;
  const nodes = m.nodes.slice(), made: Node[] = [];
  let nid = nextId(nodes);
  /** The node at a point: an existing one, or a new one. */
  const nodeAt = (p: number[]): number => {
    const hit = [...nodes, ...made].find(n => Math.hypot(n.x - p[0], n.y - p[1], n.z - p[2]) < 1e-5);
    if (hit) return hit.id;
    const n: Node = { id: nid++, x: +p[0].toFixed(6), y: +p[1].toFixed(6), z: +p[2].toFixed(6), r: DASH }; made.push(n); return n.id;
  };
  const cuts = new Map<number, { t: number; node: number }[]>();
  for (let i = 0; i < sel.length; i++) for (let j = i + 1; j < sel.length; j++) {
    const A = seg.get(sel[i].id)!, B = seg.get(sel[j].id)!; if (A.L < tol || B.L < tol) continue;
    // closest points of the two lines: A.a + s d1 and B.a + t d2, with s and t in metres along each member
    const u = A.d.map(v => v / A.L), v = B.d.map(x => x / B.L), w = [A.a.x - B.a.x, A.a.y - B.a.y, A.a.z - B.a.z];
    const b = dot(u, v), d = dot(u, w), e = dot(v, w), den = 1 - b * b; if (den < 1e-12) continue; // parallel
    const s = (b * e - d) / den, t = (e - b * d) / den;
    if (s < -tol || s > A.L + tol || t < -tol || t > B.L + tol) continue;
    const pa = [A.a.x + u[0] * s, A.a.y + u[1] * s, A.a.z + u[2] * s], pb = [B.a.x + v[0] * t, B.a.y + v[1] * t, B.a.z + v[2] * t];
    if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) > 1e-5) continue; // skew: they pass without meeting
    const id = nodeAt(pa.map((x, k) => (x + pb[k]) / 2));
    for (const [mb, g, pos] of [[sel[i], A, s], [sel[j], B, t]] as const) {
      if (pos < tol || pos > g.L - tol || id === mb.a || id === mb.b) continue; // at an end: nothing to split
      const list = cuts.get(mb.id) ?? []; if (!list.some(c => c.node === id)) list.push({ t: pos / g.L, node: id }); cuts.set(mb.id, list);
    }
  }
  if (!cuts.size) return null;
  const members: Member[] = [], dist: DistLoad[] = [], point: PointLoad[] = [], thermal: ThermalLoad[] = [], out = new Set<number>();
  let mid = nextId(m.members);
  for (const mb of m.members) {
    const list = cuts.get(mb.id);
    if (!list) { members.push(mb); continue; }
    list.sort((p, q) => p.t - q.t);
    const f = [0, ...list.map(c => c.t), 1], ends = [mb.a, ...list.map(c => c.node), mb.b], n = f.length - 1, ids2: number[] = [];
    for (let k = 0; k < n; k++) {
      const id = k === 0 ? mb.id : mid++; ids2.push(id); out.add(id);
      members.push({ ...mb, id, a: ends[k], b: ends[k + 1], relA: k === 0 ? mb.relA : DASH, kA: k === 0 ? mb.kA : undefined, relB: k === n - 1 ? mb.relB : DASH, kB: k === n - 1 ? mb.kB : undefined });
    }
    for (const l of m.distLoads.filter(x => x.member === mb.id)) for (let k = 0; k < n; k++) {
      const lo = Math.max(l.s, 100 * f[k]), hi = Math.min(l.e, 100 * f[k + 1]); if (hi - lo < 1e-9) continue;
      const w = (p: number) => l.w1 + (l.w2 - l.w1) * (p - l.s) / (l.e - l.s), span = 100 * (f[k + 1] - f[k]);
      dist.push({ ...l, member: ids2[k], w1: w(lo), w2: w(hi), s: +((lo - 100 * f[k]) / span * 100).toFixed(6), e: +((hi - 100 * f[k]) / span * 100).toFixed(6) });
    }
    for (const l of m.pointLoads.filter(x => x.member === mb.id)) {
      let k = 0; while (k < n - 1 && l.pos > 100 * f[k + 1] + 1e-9) k++;
      point.push({ ...l, member: ids2[k], pos: +((l.pos - 100 * f[k]) / (100 * (f[k + 1] - f[k])) * 100).toFixed(6) });
    }
    for (const l of m.thermal.filter(x => x.member === mb.id)) ids2.forEach(id => thermal.push({ ...l, member: id }));
  }
  const split = new Set(cuts.keys()), keep = <T extends { member: number }>(a: T[]) => a.filter(x => !split.has(x.member));
  members.sort((p, q) => p.id - q.id);
  return { model: { ...m, nodes: [...nodes, ...made], members, distLoads: [...keep(m.distLoads), ...dist], pointLoads: [...keep(m.pointLoads), ...point], thermal: [...keep(m.thermal), ...thermal] }, members: out };
}

/**
 * Moves the selected nodes and members. A member moves with its end nodes, but a node that is also used by a member that is not selected stays where it is:
 * the selected members are joined to a new node at the moved position instead (without the restraint, loads or mass of the original). A node that is itself
 * selected moves, and takes every member attached to it along.
 */
export function moveSelection(m: Model, nodeIds: Set<number>, memberIds: Set<number>, tf: (n: Node) => [number, number, number]): Model {
  const used = new Map<number, boolean>(); // node → used by a member that is not selected
  for (const b of m.members) if (!memberIds.has(b.id)) { used.set(b.a, true); used.set(b.b, true); }
  const inPlace = new Set(nodeIds), copy = new Map<number, number>();
  let nid = nextId(m.nodes);
  for (const b of m.members) if (memberIds.has(b.id)) for (const n of [b.a, b.b]) {
    if (inPlace.has(n) || copy.has(n)) continue;
    if (used.get(n)) copy.set(n, nid++); else inPlace.add(n);
  }
  const at = (n: Node) => { const [x, y, z] = tf(n).map(v => +v.toFixed(6)); return { x, y, z }; };
  const made: Node[] = m.nodes.filter(n => copy.has(n.id)).map(n => ({ id: copy.get(n.id)!, ...at(n), r: DASH }));
  return {
    ...m,
    nodes: [...m.nodes.map(n => (inPlace.has(n.id) ? { ...n, ...at(n) } : n)), ...made],
    members: m.members.map(b => (memberIds.has(b.id) && (copy.has(b.a) || copy.has(b.b)) ? { ...b, a: copy.get(b.a) ?? b.a, b: copy.get(b.b) ?? b.b } : b)),
  };
}

/**
 * The load cases that a combination is made of, with their factors, where a combination may include other combinations: the factor of an included combination
 * multiplies the factors of its own parts. A reference that would loop back to a combination being expanded is ignored.
 */
export function expandCombo(m: Model, id: number): Map<number, number> {
  const out = new Map<number, number>(), combos = new Map(m.combos.map(c => [c.id, c]));
  const walk = (cid: number, mult: number, path: Set<number>) => {
    const c = combos.get(cid); if (!c || path.has(cid)) return;
    const p = new Set(path).add(cid);
    for (const [k, v] of Object.entries(c.f)) {
      const kid = Number(k), f = Number(v); if (!f) continue;
      if (combos.has(kid)) walk(kid, mult * f, p); else out.set(kid, (out.get(kid) ?? 0) + mult * f);
    }
  };
  walk(id, 1, new Set());
  return out;
}
/** Whether combination `a` includes combination `b`, directly or through others (so that `b` may not include `a`). */
export function comboIncludes(m: Model, a: number, b: number): boolean {
  const combos = new Map(m.combos.map(c => [c.id, c])), seen = new Set<number>();
  const walk = (id: number): boolean => {
    if (seen.has(id)) return false; seen.add(id);
    const c = combos.get(id); if (!c) return false;
    return Object.entries(c.f).some(([k, v]) => v && combos.has(Number(k)) && (Number(k) === b || walk(Number(k))));
  };
  return walk(a);
}

/** A point turned by `angle` (radians, right-hand rule) about the axis through `centre` in the direction `axis` (a unit vector). */
export function rotatePoint(p: [number, number, number], centre: number[], axis: number[], angle: number): [number, number, number] {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1, e = axis.map(v => v / l), c = Math.cos(angle), s = Math.sin(angle);
  const v = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
  const cross = [e[1] * v[2] - e[2] * v[1], e[2] * v[0] - e[0] * v[2], e[0] * v[1] - e[1] * v[0]], dot = e[0] * v[0] + e[1] * v[1] + e[2] * v[2];
  return [0, 1, 2].map(i => centre[i] + v[i] * c + cross[i] * s + e[i] * dot * (1 - c)) as [number, number, number];
}
