/**
 * Normal stress at a point of a cross section, from the section forces of a member result.
 * Units: N in kN, Mz and My in kNm, section properties in mm, stress in MPa (N/mm²).
 * Signs follow the member results: tension is positive; a positive Mz is sagging about the local z axis (compression at +y), and
 * a positive My gives tension at +z. The point (y, z) is measured from the centroid along the local y and z axes (mm).
 */
export type StressKind = 'none' | 'normal' | 'axial' | 'mz' | 'my';
export function fibreStress(kind: StressKind, N: number, Mz: number, My: number, y: number, z: number, A: number, Iy: number, Iz: number): number {
  const n = N * 1000 / A, bz = -Mz * 1e6 * y / Iz, by = My * 1e6 * z / Iy;
  return kind === 'axial' ? n : kind === 'mz' ? bz : kind === 'my' ? by : n + bz + by;
}
