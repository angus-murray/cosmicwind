import { expect, test } from 'bun:test';
import { LIBRARY, outlineLoops, shapeProps, SHAPES, equivalentOutline } from './sections';

const area = (l: [number, number][]) => l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
const centroid = (l: [number, number][]) => {
  const a = area(l); let cy = 0, cz = 0;
  l.forEach((p, i) => { const q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; cy += (p[0] + q[0]) * c; cz += (p[1] + q[1]) * c; });
  return [cy / (6 * a), cz / (6 * a)];
};
const netArea = (loops: [number, number][][]) => loops.reduce((s, l) => s + area(l), 0);

test('library outlines enclose the section area (root fillets excluded)', () => {
  for (const s of LIBRARY) {
    const a = netArea(outlineLoops(s.outline));
    expect(a / s.A).toBeGreaterThan(0.94);
    expect(a / s.A).toBeLessThan(1.06)
  }
});

test('outline loops are centred on the area centroid, outer loop counter-clockwise and holes clockwise', () => {
  const dims: Record<string, number[]> = { rect: [300, 150], circle: [200], i: [310, 165, 10, 6], rhs: [200, 100, 6], chs: [168.3, 6.4], channel: [230, 75, 12, 6.5], angle: [100, 100, 8] };
  for (const sh of SHAPES) {
    const loops = outlineLoops({ shape: sh.value, dims: dims[sh.value] });
    expect(area(loops[0])).toBeGreaterThan(0);
    loops.slice(1).forEach(h => expect(area(h)).toBeLessThan(0));
    let a = 0, cy = 0, cz = 0;
    for (const l of loops) { const s = area(l), c = centroid(l); a += s; cy += s * c[0]; cz += s * c[1]; }
    expect(Math.abs(cy / a)).toBeLessThan(1e-6);
    expect(Math.abs(cz / a)).toBeLessThan(1e-6);
  }
});

test('fallback outline keeps the area', () => {
  const p = { A: 5210, Iy: 7650000, Iz: 86400000, J: 157000 }, o = equivalentOutline(p);
  expect(netArea(outlineLoops(o)) / p.A).toBeCloseTo(1, 6);
  expect(shapeProps('rect', o.dims).A / p.A).toBeCloseTo(1, 6);
});
