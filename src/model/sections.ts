/**
 * Section library. Properties are calculated from the nominal dimensions (root fillets and corner radii included in
 * the area and second moments), so they agree closely with, but are not copied from, the manufacturers' tables.
 * Local axes: y is in the plane of the web (depth), z across the flanges, so Iz is the major-axis second moment.
 */
export interface Props { A: number; Iy: number; Iz: number; J: number }
export interface LibSection extends Props { name: string; group: string; outline: Outline }
/** Nominal shape and dimensions (mm), kept with a section so that the rendered view can draw its cross section. */
export interface Outline { shape: Shape; dims: number[] }

const FIL = 1 - Math.PI / 4;             // area of a fillet of unit radius
const FIL_C = (10 - 3 * Math.PI) / (12 - 3 * Math.PI); // its centroid from the corner (× r) = 0.2234
const FIL_I = 0.0075449;                 // its centroidal second moment (× r⁴)

/** Doubly symmetric I-section: depth d, flange width b, flange tf, web tw, root radius r (mm). */
export function iSection(d: number, b: number, tf: number, tw: number, r = 0): Props {
  const hw = d - 2 * tf, af = FIL * r * r;
  const A = 2 * b * tf + hw * tw + 4 * af;
  const yf = hw / 2 - FIL_C * r, zf = tw / 2 + FIL_C * r;
  const Iz = (b * d ** 3 - (b - tw) * hw ** 3) / 12 + 4 * (FIL_I * r ** 4 + af * yf * yf);
  const Iy = (2 * tf * b ** 3 + hw * tw ** 3) / 12 + 4 * (FIL_I * r ** 4 + af * zf * zf);
  const J = (2 * b * tf ** 3 + (d - tf) * tw ** 3) / 3;
  return { A, Iy, Iz, J };
}

/** Parallel flange channel (properties about the centroidal axes). */
export function channel(d: number, b: number, tf: number, tw: number, r = 0): Props {
  const hw = d - 2 * tf, af = FIL * r * r;
  const parts: [number, number, number][] = [ // area, z centroid from the web back, own Iy
    [b * tf, b / 2, tf * b ** 3 / 12], [b * tf, b / 2, tf * b ** 3 / 12], [hw * tw, tw / 2, hw * tw ** 3 / 12],
    [af, tw + FIL_C * r, FIL_I * r ** 4], [af, tw + FIL_C * r, FIL_I * r ** 4],
  ];
  const A = parts.reduce((s, p) => s + p[0], 0), zc = parts.reduce((s, p) => s + p[0] * p[1], 0) / A;
  const Iy = parts.reduce((s, p) => s + p[2] + p[0] * (p[1] - zc) ** 2, 0);
  const yf = hw / 2 - FIL_C * r;
  const Iz = (b * d ** 3 - (b - tw) * hw ** 3) / 12 + 2 * (FIL_I * r ** 4 + af * yf * yf);
  return { A, Iy, Iz, J: (2 * b * tf ** 3 + (d - tf) * tw ** 3) / 3 };
}

export const rect = (d: number, b: number): Props => {
  const lo = Math.min(d, b), hi = Math.max(d, b);
  return { A: b * d, Iz: b * d ** 3 / 12, Iy: d * b ** 3 / 12, J: hi * lo ** 3 * (1 / 3 - 0.21 * (lo / hi) * (1 - lo ** 4 / (12 * hi ** 4))) };
};
export const circle = (d: number): Props => ({ A: Math.PI * d * d / 4, Iy: Math.PI * d ** 4 / 64, Iz: Math.PI * d ** 4 / 64, J: Math.PI * d ** 4 / 32 });
export const chs = (d: number, t: number): Props => {
  const di = d - 2 * t, I = Math.PI * (d ** 4 - di ** 4) / 64;
  return { A: Math.PI * (d * d - di * di) / 4, Iy: I, Iz: I, J: 2 * I };
};

/** Solid rectangle d × b with corner radius r: [A, Iz, Iy]. */
function rounded(d: number, b: number, r: number): [number, number, number] {
  const a = FIL * r * r, I = (dd: number, bb: number) => bb * dd ** 3 / 12 - 4 * (FIL_I * r ** 4 + a * (dd / 2 - FIL_C * r) ** 2);
  return [d * b - 4 * a, I(d, b), I(b, d)];
}
/** Rectangular hollow section, depth d, width b, wall t; corner radii to AS/NZS 1163 (2t outside, 2.5t above 3 mm). */
export function rhs(d: number, b: number, t: number): Props {
  const ro = (t <= 3 ? 2 : 2.5) * t, ri = ro - t;
  const o = rounded(d, b, ro), i = rounded(d - 2 * t, b - 2 * t, ri);
  const rc = (ro + ri) / 2, h = 2 * ((d - t) + (b - t)) - 2 * rc * (4 - Math.PI), Ah = (d - t) * (b - t) - rc * rc * (4 - Math.PI);
  return { A: o[0] - i[0], Iz: o[1] - i[1], Iy: o[2] - i[2], J: t ** 3 * h / 3 + 4 * Ah * Ah * t / h };
}
/** Equal or unequal angle, legs d (along y) and b (along z), thickness t. Properties about the leg-parallel centroidal axes. */
export function angle(d: number, b: number, t: number): Props {
  const A = t * (d + b - t);
  const yc = (t * d * d / 2 + (b - t) * t * t / 2) / A, zc = (t * b * b / 2 + (d - t) * t * t / 2) / A;
  const Iz = t * d ** 3 / 12 + t * d * (d / 2 - yc) ** 2 + (b - t) * t ** 3 / 12 + (b - t) * t * (t / 2 - yc) ** 2;
  const Iy = t * b ** 3 / 12 + t * b * (b / 2 - zc) ** 2 + (d - t) * t ** 3 / 12 + (d - t) * t * (t / 2 - zc) ** 2;
  return { A, Iy, Iz, J: (d + b - t) * t ** 3 / 3 };
}

const UB: [string, number, number, number, number, number][] = [
  ['610UB125', 612, 229, 19.6, 11.9, 14], ['610UB113', 607, 228, 17.3, 11.2, 14], ['610UB101', 602, 228, 14.8, 10.6, 14],
  ['530UB92.4', 533, 209, 15.6, 10.2, 14], ['530UB82.0', 528, 209, 13.2, 9.6, 14],
  ['460UB82.1', 460, 191, 16.0, 9.9, 11.4], ['460UB74.6', 457, 190, 14.5, 9.1, 11.4], ['460UB67.1', 454, 190, 12.7, 8.5, 11.4],
  ['410UB59.7', 406, 178, 12.8, 7.8, 11.4], ['410UB53.7', 403, 178, 10.9, 7.6, 11.4],
  ['360UB56.7', 359, 172, 13.0, 8.0, 11.4], ['360UB50.7', 356, 171, 11.5, 7.3, 11.4], ['360UB44.7', 352, 171, 9.7, 6.9, 11.4],
  ['310UB46.2', 307, 166, 11.8, 6.7, 11.4], ['310UB40.4', 304, 165, 10.2, 6.1, 11.4], ['310UB32.0', 298, 149, 8.0, 5.5, 13.0],
  ['250UB37.3', 256, 146, 10.9, 6.4, 8.9], ['250UB31.4', 252, 146, 8.6, 6.1, 8.9], ['250UB25.7', 248, 124, 8.0, 5.0, 12.0],
  ['200UB29.8', 207, 134, 9.6, 6.3, 8.9], ['200UB25.4', 203, 133, 7.8, 5.8, 8.9], ['200UB22.3', 202, 133, 7.0, 5.0, 8.9], ['200UB18.2', 198, 99, 7.0, 4.5, 11.0],
  ['180UB22.2', 179, 90, 10.0, 6.0, 8.9], ['180UB18.1', 175, 90, 8.0, 5.0, 8.9], ['180UB16.1', 173, 90, 7.0, 4.5, 8.9],
  ['150UB18.0', 155, 75, 9.5, 6.0, 8.0], ['150UB14.0', 150, 75, 7.0, 5.0, 8.0],
];
const UC: typeof UB = [
  ['310UC158', 327, 311, 25.0, 15.7, 16.5], ['310UC137', 321, 309, 21.7, 13.8, 16.5], ['310UC118', 315, 307, 18.7, 11.9, 16.5], ['310UC96.8', 308, 305, 15.4, 9.9, 16.5],
  ['250UC89.5', 260, 256, 17.3, 10.5, 14], ['250UC72.9', 254, 254, 14.2, 8.6, 14],
  ['200UC59.5', 210, 205, 14.2, 9.3, 11.4], ['200UC52.2', 206, 204, 12.5, 8.0, 11.4], ['200UC46.2', 203, 203, 11.0, 7.3, 11.4],
  ['150UC37.2', 162, 154, 11.5, 8.1, 8.9], ['150UC30.0', 158, 153, 9.4, 6.6, 8.9], ['150UC23.4', 152, 152, 6.8, 6.1, 8.9],
  ['100UC14.8', 97, 99, 7.0, 5.0, 10],
];
const PFC: typeof UB = [
  ['380PFC', 380, 100, 17.5, 10, 14], ['300PFC', 300, 90, 16, 8, 14], ['250PFC', 250, 90, 15, 8, 12], ['230PFC', 230, 75, 12, 6.5, 12],
  ['200PFC', 200, 75, 12, 6, 12], ['180PFC', 180, 75, 11, 6, 12], ['150PFC', 150, 75, 9.5, 6, 10], ['125PFC', 125, 65, 7.5, 4.7, 8],
  ['100PFC', 100, 50, 6.7, 4.2, 8], ['75PFC', 75, 40, 6.1, 3.8, 8],
];
const SHS: [number, number[]][] = [
  [50, [2, 3, 4, 5]], [65, [3, 4, 5, 6]], [75, [3, 4, 5, 6]], [89, [3.5, 5, 6]], [100, [3, 4, 5, 6, 9]], [125, [4, 5, 6, 9]],
  [150, [5, 6, 9]], [200, [5, 6, 9, 12.5]], [250, [6, 9, 12.5, 16]], [300, [8, 10, 12.5, 16]], [350, [8, 10, 12.5, 16]], [400, [10, 12.5, 16]],
];
const RHS: [number, number, number[]][] = [
  [75, 50, [2, 3, 4, 5]], [100, 50, [3, 4, 5, 6]], [125, 75, [3, 4, 5, 6]], [150, 50, [3, 4, 5, 6]], [150, 100, [4, 5, 6, 9]],
  [200, 100, [4, 5, 6, 9]], [250, 150, [5, 6, 9, 12.5]], [300, 200, [6, 8, 10, 12.5, 16]], [350, 250, [8, 10, 12.5, 16]], [400, 200, [8, 10, 12.5, 16]], [400, 300, [8, 10, 12.5, 16]],
];
const CHS: [number, number[]][] = [
  [48.3, [3.2, 4.0]], [60.3, [3.6, 4.5]], [76.1, [3.6, 4.5]], [88.9, [4.0, 5.0]], [101.6, [4.0, 5.0]], [114.3, [4.5, 6.0]], [139.7, [5.0, 5.4]],
  [165.1, [5.0, 5.4]], [168.3, [4.8, 6.4, 7.1]], [219.1, [4.8, 6.4, 8.2]], [273.1, [4.8, 6.4, 9.3]], [323.9, [6.4, 9.5, 12.7]], [355.6, [6.4, 9.5, 12.7]],
  [406.4, [6.4, 9.5, 12.7]], [457, [6.4, 9.5, 12.7]], [508, [6.4, 9.5, 12.7]], [610, [6.4, 9.5, 12.7]],
];
const EA: [number, number[]][] = [
  [50, [3, 5, 6]], [65, [5, 6, 8]], [75, [5, 6, 8, 10]], [90, [6, 8, 10]], [100, [6, 8, 10, 12]], [125, [8, 10, 12, 16]], [150, [10, 12, 16, 19]], [200, [13, 16, 20, 26]],
];

export const LIBRARY: LibSection[] = [
  ...UB.map(([name, ...d]) => ({ name, group: 'Universal Beams', outline: { shape: 'i' as const, dims: d }, ...iSection(...(d as [number, number, number, number, number])) })),
  ...UC.map(([name, ...d]) => ({ name, group: 'Universal Columns', outline: { shape: 'i' as const, dims: d }, ...iSection(...(d as [number, number, number, number, number])) })),
  ...PFC.map(([name, ...d]) => ({ name, group: 'Parallel Flange Channels', outline: { shape: 'channel' as const, dims: d }, ...channel(...(d as [number, number, number, number, number])) })),
  ...SHS.flatMap(([b, ts]) => ts.map(t => ({ name: `${b}×${b}×${t.toFixed(1)} SHS`, group: 'Square Hollow Sections', outline: { shape: 'rhs' as const, dims: [b, b, t] }, ...rhs(b, b, t) }))),
  ...RHS.flatMap(([d, b, ts]) => ts.map(t => ({ name: `${d}×${b}×${t.toFixed(1)} RHS`, group: 'Rectangular Hollow Sections', outline: { shape: 'rhs' as const, dims: [d, b, t] }, ...rhs(d, b, t) }))),
  ...CHS.flatMap(([d, ts]) => ts.map(t => ({ name: `${d.toFixed(1)}×${t.toFixed(1)} CHS`, group: 'Circular Hollow Sections', outline: { shape: 'chs' as const, dims: [d, t] }, ...chs(d, t) }))),
  ...EA.flatMap(([b, ts]) => ts.map(t => ({ name: `${b}×${b}×${t} EA`, group: 'Equal Angles', outline: { shape: 'angle' as const, dims: [b, b, t] }, ...angle(b, b, t) }))),
];
export const LIB_GROUPS = [...new Set(LIBRARY.map(s => s.group))];

export type Shape = 'rect' | 'circle' | 'i' | 'rhs' | 'chs' | 'channel' | 'angle';
export const SHAPES: { value: Shape; label: string; dims: string[] }[] = [
  { value: 'rect', label: 'Rectangle', dims: ['Depth', 'Width'] },
  { value: 'circle', label: 'Circle', dims: ['Diameter'] },
  { value: 'i', label: 'I-Section', dims: ['Depth', 'Flange Width', 'Flange Thickness', 'Web Thickness'] },
  { value: 'rhs', label: 'Rectangular Hollow', dims: ['Depth', 'Width', 'Wall Thickness'] },
  { value: 'chs', label: 'Circular Hollow', dims: ['Diameter', 'Wall Thickness'] },
  { value: 'channel', label: 'Channel', dims: ['Depth', 'Flange Width', 'Flange Thickness', 'Web Thickness'] },
  { value: 'angle', label: 'Angle', dims: ['Leg (y)', 'Leg (z)', 'Thickness'] },
];
export function shapeProps(shape: Shape, d: number[]): Props {
  switch (shape) {
    case 'rect': return rect(d[0], d[1]);
    case 'circle': return circle(d[0]);
    case 'i': return iSection(d[0], d[1], d[2], d[3]);
    case 'rhs': return rhs(d[0], d[1], d[2]);
    case 'chs': return chs(d[0], d[1]);
    case 'channel': return channel(d[0], d[1], d[2], d[3]);
    case 'angle': return angle(d[0], d[1], d[2]);
  }
}
export const shapeName = (shape: Shape, d: number[]) =>
  shape === 'rect' ? `${d[0]}×${d[1]} Rect` : shape === 'circle' ? `${d[0]} Dia` : shape === 'i' ? `${d[0]}×${d[1]} I` : shape === 'rhs' ? `${d[0]}×${d[1]}×${d[2]} Box`
    : shape === 'chs' ? `${d[0]}×${d[1]} Tube` : shape === 'channel' ? `${d[0]}×${d[1]} Channel` : `${d[0]}×${d[1]}×${d[2]} Angle`;

type Pt = [number, number];
const ring = (n: number, r: number): Pt[] => Array.from({ length: n }, (_, i) => [r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]);
const box = (d: number, b: number): Pt[] => [[-d / 2, -b / 2], [-d / 2, b / 2], [d / 2, b / 2], [d / 2, -b / 2]];
/** Rounds the corners of a closed polygon: radii[i] is the radius at vertex i (0 or missing leaves it sharp). */
function fillet(l: Pt[], radii: number[], n = 6): Pt[] {
  const out: Pt[] = [];
  l.forEach((v, i) => {
    const r = radii[i] ?? 0, a = l[(i + l.length - 1) % l.length], b = l[(i + 1) % l.length];
    if (!(r > 0)) { out.push(v); return; }
    const la = Math.hypot(a[0] - v[0], a[1] - v[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
    const u1: Pt = [(a[0] - v[0]) / la, (a[1] - v[1]) / la], u2: Pt = [(b[0] - v[0]) / lb, (b[1] - v[1]) / lb];
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const t = Math.min(r / Math.tan(th / 2), la / 2, lb / 2), rr = t * Math.tan(th / 2); // tangent length, kept inside the adjoining edges
    const bx = u1[0] + u2[0], by = u1[1] + u2[1], bl = Math.hypot(bx, by), cd = rr / Math.sin(th / 2);
    const c: Pt = [v[0] + bx / bl * cd, v[1] + by / bl * cd];
    const a1 = Math.atan2(v[1] + u1[1] * t - c[1], v[0] + u1[0] * t - c[0]), a2 = Math.atan2(v[1] + u2[1] * t - c[1], v[0] + u2[0] * t - c[0]);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    for (let k = 0; k <= n; k++) out.push([c[0] + rr * Math.cos(a1 + d * k / n), c[1] + rr * Math.sin(a1 + d * k / n)]);
  });
  return out;
}
const rbox = (d: number, b: number, r: number): Pt[] => fillet(box(d, b), [r, r, r, r]);
const area = (l: Pt[]) => l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);

/**
 * Cross section drawn in the rendered view: closed loops of [y, z] points (mm) about the area centroid, the outer loop
 * first and counter-clockwise, any holes after it and clockwise. Corner radii of hollow sections (outer 2.5 t, or 2 t up to 3 mm) and the root fillets of I-sections and channels are drawn.
 */
export function outlineLoops({ shape, dims: d }: Outline): Pt[][] {
  let loops: Pt[][];
  switch (shape) {
    case 'rect': loops = [box(d[0], d[1])]; break;
    case 'circle': loops = [ring(24, d[0] / 2)]; break;
    case 'i': { const [D, b, tf, tw, r = 0] = d, h = D / 2, w = b / 2, v = tw / 2;
      loops = [fillet([[-h, -w], [-h, w], [-h + tf, w], [-h + tf, v], [h - tf, v], [h - tf, w], [h, w], [h, -w], [h - tf, -w], [h - tf, -v], [-h + tf, -v], [-h + tf, -w]],
        [0, 0, 0, r, r, 0, 0, 0, 0, r, r, 0])]; break; }
    case 'channel': { const [D, b, tf, tw, r = 0] = d, h = D / 2;
      loops = [fillet([[-h, 0], [-h, b], [-h + tf, b], [-h + tf, tw], [h - tf, tw], [h - tf, b], [h, b], [h, 0]], [0, 0, 0, r, r, 0, 0, 0])]; break; }
    case 'angle': { const [D, b, t] = d; loops = [[[0, 0], [0, b], [t, b], [t, t], [D, t], [D, 0]]]; break; }
    case 'rhs': { const ro = Math.min((d[2] <= 3 ? 2 : 2.5) * d[2], d[0] / 2, d[1] / 2); loops = [rbox(d[0], d[1], ro), rbox(d[0] - 2 * d[2], d[1] - 2 * d[2], ro - d[2])]; break; }
    case 'chs': loops = [ring(24, d[0] / 2), ring(24, d[0] / 2 - d[1])]; break;
  }
  // centroid of the area enclosed by the outer loop less the holes
  let a = 0, cy = 0, cz = 0;
  loops.forEach((l, k) => {
    const sg = Math.sign(area(l)) * (k ? -1 : 1); // polygon centroid by the shoelace formula, signed so that holes subtract
    l.forEach((p, i) => { const q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a += sg * c / 2; cy += sg * (p[0] + q[0]) * c / 6; cz += sg * (p[1] + q[1]) * c / 6; });
  });
  const oy = cy / a, oz = cz / a;
  return loops.map((l, k) => { const m = l.map(p => [p[0] - oy, p[1] - oz] as Pt); return (area(m) > 0) === (k === 0) ? m : m.reverse(); });
}

/** Outline for a section that has none stored: a solid rectangle of the same area, with the depth to width ratio of the two second moments. */
export function equivalentOutline(p: Props): Outline {
  const k = Math.sqrt(Math.max(p.Iz, 1e-9) / Math.max(p.Iy, 1e-9)), b = Math.sqrt(p.A / k);
  return { shape: 'rect', dims: [Math.min(p.A / b, 5000), Math.min(b, 5000)] };
}

/** Outline of a stored section: its own, else the library section of the same name (models saved before outlines were kept), else an equivalent rectangle. */
export const outlineOf = (s: { name: string; outline?: Outline } & Props): Outline => s.outline ?? LIBRARY.find(l => l.name === s.name)?.outline ?? equivalentOutline(s);
