/**
 * MoonDust model. Units: coordinates m, forces kN, moments kNm, section properties mm-based, E and G in MPa,
 * density kg/m³. Global Y is vertical (up).
 */
export interface Node { id: number; x: number; y: number; z: number; /** Six characters, F (fixed) or R (released), for DX DY DZ RX RY RZ. */ r: string }
export interface Spring { node: number; k: number[] } // kN/m ×3, kNm/rad ×3
import type { Outline } from './sections';
export interface Section { id: number; name: string; A: number; Iy: number; Iz: number; J: number; /** Nominal shape, for the rendered view only. */ outline?: Outline } // mm², mm⁴
export interface Material { id: number; name: string; E: number; G: number; rho: number; alpha: number } // MPa, MPa, kg/m³, /°C
export type MemberType = 'N' | 'T' | 'C';
export interface Member {
  id: number; a: number; b: number; sec: number; mat: number;
  /** Rotation of the section about the member axis (degrees). */
  angle: number; type: MemberType;
  /** End releases at A and B: six characters, F or R, for the local x y z forces and x y z moments. */
  relA: string; relB: string;
}
export interface LoadCase { id: number; name: string; /** Self-weight multipliers of g in global X, Y, Z. */ gx: number; gy: number; gz: number }
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

export interface Settings {
  nonlinear: boolean;       // P-Δ (second-order) analysis
  bucklingModes: number;    // 0 = off
  modalModes: number;       // 0 = off
  stations: number;         // result stations per member
}

export interface Model {
  title: string;
  nodes: Node[]; members: Member[]; sections: Section[]; materials: Material[]; springs: Spring[];
  loadCases: LoadCase[]; combos: Combo[];
  nodeLoads: NodeLoad[]; distLoads: DistLoad[]; pointLoads: PointLoad[]; settlements: Settlement[]; thermal: ThermalLoad[];
  masses: NodeMass[];
  settings: Settings;
}

export const FREE = 'RRRRRR', FIXED = 'FFFFFF', PIN = 'FFFRRR';
export const RESTRAINTS: [string, string][] = [
  [FREE, 'Free'], [FIXED, 'Fixed'], [PIN, 'Pinned'], ['RFRRRR', 'Roller (Y)'], ['RFFRRR', 'Roller (Y, Z)'], ['FFFFFR', 'Pin 2D (XY)'], ['RFFFFR', 'Roller 2D (XY)'], ['RRFFFR', 'Plane XY'],
];
export const RELEASES: [string, string][] = [
  ['FFFFFF', 'Rigid'], ['FFFFRR', 'Pinned (My, Mz)'], ['FFFRRR', 'Pinned (All)'], ['FFFFFR', 'Mz Released'], ['FFFFRF', 'My Released'], ['RFFFFF', 'Axial Released'],
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

export const DEFAULT_SETTINGS: Settings = { nonlinear: false, bucklingModes: 0, modalModes: 0, stations: 21 };

export const emptyModel = (): Model => ({
  title: 'Untitled', nodes: [], members: [], sections: [], materials: [{ ...STEEL }], springs: [],
  loadCases: [{ id: 1, name: 'Dead Load', gx: 0, gy: -1, gz: 0 }], combos: [],
  nodeLoads: [], distLoads: [], pointLoads: [], settlements: [], thermal: [], masses: [],
  settings: { ...DEFAULT_SETTINGS },
});

export const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

/** Fills in anything missing from a model loaded from a file or storage. */
export function normalise(m: Partial<Model>): Model {
  const e = emptyModel();
  const out = { ...e, ...m, settings: { ...e.settings, ...(m.settings ?? {}) } } as Model;
  for (const k of ['nodes', 'members', 'sections', 'materials', 'springs', 'loadCases', 'combos', 'nodeLoads', 'distLoads', 'pointLoads', 'settlements', 'thermal', 'masses'] as const)
    if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown>)[k] = [];
  return out;
}

/** Removes a node or member with everything that refers to it. */
export function deleteNodes(m: Model, ids: Set<number>): Model {
  const members = m.members.filter(b => !ids.has(b.a) && !ids.has(b.b));
  const gone = new Set(m.members.filter(b => !members.includes(b)).map(b => b.id));
  return {
    ...deleteMembers({ ...m }, gone),
    nodes: m.nodes.filter(n => !ids.has(n.id)), springs: m.springs.filter(s => !ids.has(s.node)),
    nodeLoads: m.nodeLoads.filter(l => !ids.has(l.node)), settlements: m.settlements.filter(l => !ids.has(l.node)),
    masses: m.masses.filter(l => !ids.has(l.node)),
  };
}
export function deleteMembers(m: Model, ids: Set<number>): Model {
  return {
    ...m, members: m.members.filter(b => !ids.has(b.id)),
    distLoads: m.distLoads.filter(l => !ids.has(l.member)), pointLoads: m.pointLoads.filter(l => !ids.has(l.member)),
    thermal: m.thermal.filter(l => !ids.has(l.member)),
  };
}
