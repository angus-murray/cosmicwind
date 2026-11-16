/**
 * Display units. The model is always stored in m, kN, kNm, MPa and t (section properties and settlements in mm, density in kg/m³), so changing the
 * units changes only what is shown and typed, never the size of the model or its forces. Time is always seconds.
 */
import { createContext, useContext } from 'react';

export type LengthU = 'm' | 'mm';
export type ForceU = 'N' | 'kN' | 'MN';
export type StressU = 'Pa' | 'kPa' | 'MPa';
export type MassU = 'kg' | 't';
export type TempU = 'C' | 'K';
export interface Units { length: LengthU; force: ForceU; stress: StressU; mass: MassU; temp: TempU }

export const PRESETS: { name: string; units: Units }[] = [
  { name: 'SI', units: { length: 'm', force: 'N', stress: 'Pa', mass: 'kg', temp: 'K' } },
  { name: 'N.mm', units: { length: 'mm', force: 'N', stress: 'MPa', mass: 't', temp: 'C' } },
  { name: 'kN.m', units: { length: 'm', force: 'kN', stress: 'kPa', mass: 't', temp: 'C' } },
];
/** The units the model is stored in. */
export const BASE: Units = { length: 'm', force: 'kN', stress: 'MPa', mass: 't', temp: 'C' };
export const OPTIONS = {
  length: ['mm', 'm'], force: ['N', 'kN', 'MN'], stress: ['Pa', 'kPa', 'MPa'], mass: ['kg', 't'], temp: ['C', 'K'],
} as const;

/** The preset that matches the units, if any. */
export const presetOf = (u: Units) => PRESETS.find(p => (Object.keys(p.units) as (keyof Units)[]).every(k => p.units[k] === u[k]))?.name ?? null;

/** A quantity as powers of length (l), force (f), stress (s) and mass (m) in the stored units, and the factor k from the stored value to those base units. */
interface Dim { l?: number; f?: number; s?: number; m?: number; k?: number }
const Q = {
  length: { l: 1 }, lengthMm: { l: 1, k: 1e-3 }, area: { l: 2, k: 1e-6 }, inertia: { l: 4, k: 1e-12 },
  force: { f: 1 }, moment: { f: 1, l: 1 }, forcePerLength: { f: 1, l: -1 }, forcePerLength2: { f: 1, l: -2 }, rotStiffness: { f: 1, l: 1 },
  stress: { s: 1 }, mass: { m: 1 }, density: { m: 1, l: -3, k: 1e-3 }, tempChange: {}, perTemp: {},
} satisfies Record<string, Dim>;
export type Quantity = keyof typeof Q;

const LF: Record<LengthU, number> = { m: 1, mm: 1000 }, FF: Record<ForceU, number> = { kN: 1, N: 1000, MN: 1e-3 };
const SF: Record<StressU, number> = { MPa: 1, kPa: 1000, Pa: 1e6 }, MF: Record<MassU, number> = { t: 1, kg: 1000 };

/** Factor from the stored value to the value in the units shown. */
export function factor(q: Quantity, u: Units): number {
  const d: Dim = Q[q];
  return (d.k ?? 1) * LF[u.length] ** (d.l ?? 0) * FF[u.force] ** (d.f ?? 0) * SF[u.stress] ** (d.s ?? 0) * MF[u.mass] ** (d.m ?? 0);
}
const clean = (v: number) => (v === 0 || !isFinite(v) ? v : Number(v.toPrecision(12)));
export const toShown = (q: Quantity, u: Units, v: number) => clean(v * factor(q, u));
export const fromShown = (q: Quantity, u: Units, v: number) => clean(v / factor(q, u));

/** The unit text of a quantity, for example kN/m or mm². */
export function unitLabel(q: Quantity, u: Units): string {
  const L = u.length, F = u.force;
  switch (q) {
    case 'length': case 'lengthMm': return L;
    case 'area': return `${L}²`;
    case 'inertia': return `${L}⁴`;
    case 'force': return F;
    case 'moment': return `${F}${L}`;
    case 'forcePerLength': return `${F}/${L}`;
    case 'forcePerLength2': return `${F}/${L}/${L}`;
    case 'rotStiffness': return `${F}${L}/rad`;
    case 'stress': return u.stress;
    case 'mass': return u.mass;
    case 'density': return `${u.mass}/${L}³`;
    case 'tempChange': return u.temp === 'C' ? '°C' : 'K';
    case 'perTemp': return u.temp === 'C' ? '/°C' : '/K';
  }
}
/** The same text with characters that Latin-1 (the PDF font) can show. */
export const unitLabelPlain = (q: Quantity, u: Units) => unitLabel(q, u).replace('²', '2').replace('³', '3').replace('⁴', '4');

export const DEFAULT_UNITS: Units = PRESETS[2].units;
const KEY = 'cosmicwind-units';
export function loadUnits(): Units {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Units> | null;
    if (v && v.length && v.length in LF && v.force && v.force in FF && v.stress && v.stress in SF && v.mass && v.mass in MF && (v.temp === 'C' || v.temp === 'K')) return v as Units;
  } catch { /* storage unavailable */ }
  return DEFAULT_UNITS;
}
export const saveUnits = (u: Units) => { try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* storage unavailable */ } };

export const UnitsContext = createContext<Units>(DEFAULT_UNITS);
/** The units in use, with helpers to convert and label values of a quantity. */
export function useUnits() {
  const u = useContext(UnitsContext);
  return { u, show: (q: Quantity, v: number) => toShown(q, u, v), read: (q: Quantity, v: number) => fromShown(q, u, v), label: (q: Quantity) => unitLabel(q, u) };
}
