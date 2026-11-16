import { expect, test } from 'bun:test';
import { PRESETS, fromShown, presetOf, toShown, unitLabel, type Quantity } from './units';

const [SI, NMM, KNM] = PRESETS.map(p => p.units);
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(b), 1e-12));

test('presets match the Strand7 unit systems', () => {
  expect(SI).toEqual({ length: 'm', force: 'N', stress: 'Pa', mass: 'kg', temp: 'K' });
  expect(NMM).toEqual({ length: 'mm', force: 'N', stress: 'MPa', mass: 't', temp: 'C' });
  expect(KNM).toEqual({ length: 'm', force: 'kN', stress: 'kPa', mass: 't', temp: 'C' });
  expect(presetOf(NMM)).toBe('N.mm');
  expect(presetOf({ ...NMM, force: 'kN' })).toBeNull();
});

test('stored values convert to each unit system', () => {
  close(toShown('length', NMM, 3), 3000);
  close(toShown('lengthMm', KNM, 250), 0.25);          // a settlement of 250 mm
  close(toShown('force', NMM, 1), 1000);                // 1 kN is 1000 N
  close(toShown('moment', NMM, 1), 1e6);                // 1 kNm is 1e6 N.mm
  close(toShown('forcePerLength', NMM, 1), 1);          // 1 kN/m is 1 N/mm
  close(toShown('forcePerLength', SI, 1), 1000);
  close(toShown('forcePerLength2', NMM, 1), 1e-3);      // kN/m/m to N/mm/mm
  close(toShown('stress', SI, 200000), 2e11);           // E = 200 GPa
  close(toShown('stress', KNM, 200000), 2e8);
  close(toShown('area', KNM, 5210), 0.00521);
  close(toShown('inertia', KNM, 86400000), 8.64e-5);
  close(toShown('inertia', NMM, 86400000), 86400000);
  close(toShown('density', SI, 7850), 7850);
  close(toShown('density', KNM, 7850), 7.85);           // t/m3
  close(toShown('density', NMM, 7850), 7.85e-9);        // t/mm3
  close(toShown('mass', SI, 2), 2000);
});

test('a value survives a change of units and back, so the model does not change size', () => {
  const qs: Quantity[] = ['length', 'lengthMm', 'area', 'inertia', 'force', 'moment', 'forcePerLength', 'forcePerLength2', 'rotStiffness', 'stress', 'mass', 'density'];
  for (const q of qs) for (const u of PRESETS) for (const v of [0, 1, -3.7, 12345.678, 2.5e-6]) close(fromShown(q, u.units, toShown(q, u.units, v)), v);
});

test('unit text', () => {
  expect(unitLabel('forcePerLength2', KNM)).toBe('kN/m/m');
  expect(unitLabel('area', NMM)).toBe('mm²');
  expect(unitLabel('density', NMM)).toBe('t/mm³');
  expect(unitLabel('moment', SI)).toBe('Nm');
});
