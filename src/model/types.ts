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
export const RESTRAINTS: [string, string][] = [[FREE, 'Free'], [FIXED, 'Fixed'], [PIN, 'Pinned']];
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
  loadCases: [{ id: 1, name: 'Dead Load', gx: 0, gy: -1, gz: 0 }], combos: [],
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
  if (order.some(b => b.sec !== f.sec || b.mat !== f.mat || b.angle !== f.angle || b.type !== f.type || (b.ky ?? 0) !== (f.ky ?? 0) || (b.kz ?? 0) !== (f.kz ?? 0))) return { reason: 'The members differ in section, material, angle, type or continuous support.' };
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
