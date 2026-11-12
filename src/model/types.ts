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
export const RESTRAINTS: [string, string][] = [
  [FREE, 'Free'], [FIXED, 'Fixed'], [PIN, 'Pinned'], ['RFRRRR', 'Roller (Y)'], ['RFFRRR', 'Roller (Y, Z)'], ['FFFFFR', 'Pin 2D (XY)'], ['RFFFFR', 'Roller 2D (XY)'], ['RRFFFR', 'Plane XY'],
];
export const RELEASES: [string, string][] = [
  [DASH, 'Rigid'], ['FFFFRR', 'Pinned (My, Mz)'], ['FFFRRR', 'Pinned (All)'], ['FFFFFR', 'Mz Released'], ['FFFFRF', 'My Released'], ['RFFFFF', 'Axial Released'],
];

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
