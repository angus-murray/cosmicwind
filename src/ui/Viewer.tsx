import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useElementSize } from 'engineering-ui';
import type { Model } from '../model/types';
import { equivalentOutline, outlineLoops } from '../model/sections';
import { memberAxes, type CaseResult, type Vec6 } from '../solver/frame';

export type Diagram = 'none' | 'N' | 'Vy' | 'Vz' | 'T' | 'My' | 'Mz';
export type Tool = 'select' | 'node' | 'member';
export interface ViewOpts {
  nodeNo: boolean; memberNo: boolean; secNames: boolean; loads: boolean; localAxes: boolean;
  diagram: Diagram; deflected: boolean; reactions: boolean; values: boolean; scale: number; defScale: number;
  plane: 'XY' | 'XZ' | 'YZ'; offset: number; snap: number;
  /** Rendered 3D view of the member cross sections instead of the wireframe. */
  solid: boolean;
}
export interface Sel { nodes: Set<number>; members: Set<number> }
export interface ViewerHandle { fit: () => void; view: (v: 'iso' | 'front' | 'top' | 'side') => void; svg: () => SVGSVGElement | null }

type V3 = [number, number, number];
const RED = '#dc2626', GREEN = '#059669', BLUE = '#2563eb', PINK = '#c026d3', AMBER = '#d97706';
export const fmt = (v: number) => { const a = Math.abs(v); return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 0.01 || a === 0 ? v.toFixed(2) : v.toExponential(1)).replace('-', '−'); };
const halo: React.CSSProperties = { paintOrder: 'stroke', stroke: 'var(--color-slate-50)', strokeWidth: 3, strokeLinejoin: 'round' };
const DIAGRAM_COLOUR: Record<Diagram, string> = { none: BLUE, N: AMBER, Vy: GREEN, Vz: GREEN, T: PINK, My: BLUE, Mz: BLUE };

export const Viewer = React.forwardRef<ViewerHandle, {
  model: Model; opts: ViewOpts; tool: Tool; sel: Sel; onSelect: (s: Sel) => void;
  /** Loads to draw: load case id and factor. */
  loadCases: [number, number][];
  result?: CaseResult | null; mode?: Map<number, Vec6> | null;
  onAddNode: (p: V3) => number; onAddMember: (a: number, b: number) => void;
  /** Right click (without dragging) in the select tool: where, and the node or member under the pointer. */
  onContext?: (c: { x: number; y: number; node: number | null; member: number | null }) => void;
}>(function Viewer({ model, opts, tool, sel, onSelect, loadCases, result, mode, onAddNode, onAddMember, onContext }, handle) {
  const [box, size] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  // c is the orbit pivot (the model centre at the last fit); px, py are the screen offset of the pivot from the view centre.
  const [cam, setCam] = useState<{ yaw: number; pitch: number; zoom: number; px: number; py: number; c: V3 }>({ yaw: -0.5, pitch: 0.35, zoom: 40, px: 0, py: 0, c: [0, 0, 0] });
  const [chain, setChain] = useState<number | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  /** Selection box being dragged, in pixels. */
  const [marq, setMarq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const W = size.width || 800, H = size.height || 600;

  const nodeMap = useMemo(() => new Map(model.nodes.map(n => [n.id, n])), [model.nodes]);
  const bounds = useMemo(() => {
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const n of model.nodes) [n.x, n.y, n.z].forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
    if (!model.nodes.length) return { lo: [0, 0, 0] as V3, hi: [10, 6, 0] as V3, S: 10 };
    return { lo, hi, S: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1) };
  }, [model.nodes]);

  const basis = useMemo(() => {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { rx: [cy, 0, sy] as V3, ry: [sy * sp, cp, -cy * sp] as V3 };
  }, [cam.yaw, cam.pitch]);
  const P = useCallback((p: V3): [number, number] => {
    const a = p[0] - cam.c[0], b = p[1] - cam.c[1], c = p[2] - cam.c[2];
    return [
      W / 2 + cam.px + cam.zoom * (basis.rx[0] * a + basis.rx[1] * b + basis.rx[2] * c),
      H / 2 + cam.py - cam.zoom * (basis.ry[0] * a + basis.ry[1] * b + basis.ry[2] * c),
    ];
  }, [W, H, cam, basis]);
  /** Screen direction (unit) of a world vector, or null when it points at the viewer. */
  const dirS = (d: V3): [number, number] | null => {
    const x = basis.rx[0] * d[0] + basis.rx[1] * d[1] + basis.rx[2] * d[2], y = -(basis.ry[0] * d[0] + basis.ry[1] * d[1] + basis.ry[2] * d[2]), l = Math.hypot(x, y);
    return l < 0.08 * Math.hypot(...d) ? null : [x / l, y / l];
  };

  const fitTo = useCallback((yaw: number, pitch: number) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const c: V3 = [(bounds.lo[0] + bounds.hi[0]) / 2, (bounds.lo[1] + bounds.hi[1]) / 2, (bounds.lo[2] + bounds.hi[2]) / 2];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of [0, 1]) for (const j of [0, 1]) for (const k of [0, 1]) {
      const p = [(i ? bounds.hi[0] : bounds.lo[0]) - c[0], (j ? bounds.hi[1] : bounds.lo[1]) - c[1], (k ? bounds.hi[2] : bounds.lo[2]) - c[2]];
      const x = cy * p[0] + sy * p[2], y = sy * sp * p[0] + cp * p[1] - cy * sp * p[2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const zoom = Math.min((W - 300) / Math.max(x1 - x0, 1e-6), (H - 190) / Math.max(y1 - y0, 1e-6), 400);
    setCam({ yaw, pitch, zoom, px: -zoom * (x0 + x1) / 2 + 30, py: zoom * (y0 + y1) / 2, c });
  }, [bounds, W, H]);
  const flat = bounds.hi[2] - bounds.lo[2] < 1e-9;
  useImperativeHandle(handle, () => ({
    fit: () => fitTo(cam.yaw, cam.pitch),
    view: v => (v === 'iso' ? fitTo(-0.5, 0.35) : v === 'front' ? fitTo(0, 0) : v === 'top' ? fitTo(0, Math.PI / 2) : fitTo(Math.PI / 2, 0)),
    svg: () => svgRef.current,
  }));
  // Fit when the size first becomes known and whenever a different model is loaded (its extents change).
  const fitKey = `${size.width > 0}|${Math.round(size.width / 40)}|${Math.round(size.height / 40)}|${bounds.lo.join()}|${bounds.hi.join()}`;
  const lastFit = useRef(''), lastFlat = useRef(flat);
  useEffect(() => {
    if (!size.width || lastFit.current === fitKey || tool !== 'select') return;
    const first = lastFit.current === '' || lastFit.current.startsWith('false'); lastFit.current = fitKey;
    if (first || lastFlat.current !== flat) fitTo(flat ? 0 : -0.5, flat ? 0 : 0.35); else fitTo(cam.yaw, cam.pitch);
    lastFlat.current = flat;
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Pointer interaction
  // Left drag: rotate. Left click: pick a node or member, or on empty space start a selection box that the next left click completes.
  // Middle drag: zoom (as does the wheel). Right drag: pan. Right click: options.
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; moved: boolean; mode: 'orbit' | 'zoom' | 'pan' | null } | null>(null);
  /** First corner of a selection box that is waiting for its second click. */
  const anchor = useRef<[number, number] | null>(null);
  const local = (e: { clientX: number; clientY: number }): [number, number] => { const r = svgRef.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onPlane = (sx: number, sy: number): V3 | null => {
    const X = (sx - W / 2 - cam.px) / cam.zoom, Y = -(sy - H / 2 - cam.py) / cam.zoom;
    const [i, j, k] = opts.plane === 'XY' ? [0, 1, 2] : opts.plane === 'XZ' ? [0, 2, 1] : [1, 2, 0];
    const { rx, ry } = basis, a = rx[i], b = rx[j], c = ry[i], d = ry[j], det = a * d - b * c;
    if (Math.abs(det) < 0.05) return null;
    const C = cam.c, ex = X - rx[k] * (opts.offset - C[k]), ey = Y - ry[k] * (opts.offset - C[k]), p: V3 = [0, 0, 0], s = opts.snap > 0 ? opts.snap : 0;
    const snap = (v: number) => (s ? Math.round(v / s) * s : v);
    p[i] = snap((ex * d - b * ey) / det + C[i]); p[j] = snap((a * ey - c * ex) / det + C[j]); p[k] = opts.offset;
    return p.map(v => Math.round(v * 1e6) / 1e6) as V3;
  };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [sx, sy] = local(e);
    const mode = e.button === 2 ? 'pan' : e.button === 1 ? 'zoom' : e.button === 0 ? 'orbit' : null;
    drag.current = { x: e.clientX, y: e.clientY, sx, sy, moved: false, mode };
  };
  const move = (e: React.PointerEvent) => {
    if (tool === 'member' && chain !== null) setCursor(local(e));
    if (anchor.current) { const [x, y] = local(e); setMarq({ x0: anchor.current[0], y0: anchor.current[1], x1: x, y1: y }); }
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true; d.x = e.clientX; d.y = e.clientY;
    if (d.mode === 'zoom') zoomAt(d.sx - W / 2, d.sy - H / 2, Math.exp(-dy * 0.01));
    else if (d.mode === 'pan') setCam(c => ({ ...c, px: c.px + dx, py: c.py + dy }));
    else if (d.mode === 'orbit') setCam(c => ({ ...c, yaw: c.yaw + dx * 0.008, pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, c.pitch + dy * 0.008)) }));
  };
  /** Nearest node within 9 px, else nearest member within 6 px. */
  const hitAt = (sx: number, sy: number): { hitN: number | null; hitM: number | null } => {
    let hitN: number | null = null, best = 9;
    for (const n of model.nodes) { const q = P([n.x, n.y, n.z]), dist = Math.hypot(q[0] - sx, q[1] - sy); if (dist < best) { best = dist; hitN = n.id; } }
    let hitM: number | null = null;
    if (hitN === null) {
      best = 6;
      for (const m of model.members) {
        const a = nodeMap.get(m.a), b = nodeMap.get(m.b); if (!a || !b) continue;
        const p = P([a.x, a.y, a.z]), q = P([b.x, b.y, b.z]), l2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
        const t = l2 ? Math.max(0, Math.min(1, ((sx - p[0]) * (q[0] - p[0]) + (sy - p[1]) * (q[1] - p[1])) / l2)) : 0;
        const dist = Math.hypot(p[0] + t * (q[0] - p[0]) - sx, p[1] + t * (q[1] - p[1]) - sy);
        if (dist < best) { best = dist; hitM = m.id; }
      }
    }
    return { hitN, hitM };
  };
  /** Window (left to right): what lies wholly inside. Crossing (right to left): also members that touch the box. */
  const boxSelect = (m: { x0: number; y0: number; x1: number; y1: number }, add: boolean) => {
    const xa = Math.min(m.x0, m.x1), xb = Math.max(m.x0, m.x1), ya = Math.min(m.y0, m.y1), yb = Math.max(m.y0, m.y1), crossing = m.x1 < m.x0;
    const inside = (q: [number, number]) => q[0] >= xa && q[0] <= xb && q[1] >= ya && q[1] <= yb;
    const touches = (p: [number, number], q: [number, number]) => { // Liang-Barsky clip of the segment against the box
      let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
      for (const [pp, qq] of [[-dx, p[0] - xa], [dx, xb - p[0]], [-dy, p[1] - ya], [dy, yb - p[1]]] as const) {
        if (pp === 0) { if (qq < 0) return false; } else { const r = qq / pp; if (pp < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); } }
      }
      return true;
    };
    const s: Sel = add ? { nodes: new Set(sel.nodes), members: new Set(sel.members) } : { nodes: new Set(), members: new Set() };
    const pos = new Map(model.nodes.map(n => [n.id, P([n.x, n.y, n.z])]));
    pos.forEach((q, id) => { if (inside(q)) s.nodes.add(id); });
    for (const mb of model.members) {
      const p = pos.get(mb.a), q = pos.get(mb.b); if (!p || !q) continue;
      if ((inside(p) && inside(q)) || (crossing && touches(p, q))) s.members.add(mb.id);
    }
    onSelect(s);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const [sx, sy] = local(e);
    if (d.moved) return;
    if (e.button === 2) {
      if (anchor.current) { anchor.current = null; setMarq(null); return; }
      if (tool === 'select') { const h = hitAt(sx, sy); onContext?.({ x: sx, y: sy, node: h.hitN, member: h.hitM }); } else setChain(null);
      return;
    }
    if (e.button !== 0) return;
    const { hitN, hitM } = hitAt(sx, sy);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (tool === 'select' && anchor.current) { // second click: complete the box (a click without moving clears the selection)
      const [x0, y0] = anchor.current; anchor.current = null; setMarq(null);
      if (Math.hypot(sx - x0, sy - y0) < 4) { if (!add) onSelect({ nodes: new Set(), members: new Set() }); } else boxSelect({ x0, y0, x1: sx, y1: sy }, add);
      return;
    }
    if (tool === 'select' && hitN === null && hitM === null) { anchor.current = [sx, sy]; setMarq({ x0: sx, y0: sy, x1: sx, y1: sy }); return; }
    if (tool === 'select') {
      const s: Sel = add ? { nodes: new Set(sel.nodes), members: new Set(sel.members) } : { nodes: new Set(), members: new Set() };
      const toggle = (set: Set<number>, id: number) => (set.has(id) && add ? set.delete(id) : set.add(id));
      if (hitN !== null) toggle(s.nodes, hitN); else if (hitM !== null) toggle(s.members, hitM);
      onSelect(s);
      return;
    }
    let id = hitN;
    if (id === null) { const p = onPlane(sx, sy); if (!p) return; id = onAddNode(p); }
    if (tool === 'member') { if (chain !== null && chain !== id) onAddMember(chain, id); setChain(id); }
  };
  useEffect(() => { setChain(null); setCursor(null); anchor.current = null; setMarq(null); }, [tool]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setChain(null); anchor.current = null; setMarq(null); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  /** Zooms by factor f about the point (mx, my), measured from the centre of the view. */
  const zoomAt = (mx: number, my: number, f: number) =>
    setCam(c => { const z = Math.max(0.5, Math.min(5000, c.zoom * f)), k = z / c.zoom; return { ...c, zoom: z, px: mx - (mx - c.px) * k, py: my - (my - c.py) * k }; });
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, Math.exp(-e.deltaY * 0.0012));
    };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, []);

  // ---- Geometry of the members
  const geo = useMemo(() => model.members.flatMap(m => {
    const a = nodeMap.get(m.a), b = nodeMap.get(m.b); if (!a || !b) return [];
    const { L, R } = memberAxes(a, b, m.angle || 0); if (L < 1e-9) return [];
    return [{ m, A: [a.x, a.y, a.z] as V3, B: [b.x, b.y, b.z] as V3, L, R }];
  }), [model.members, nodeMap]);
  const along = (g: (typeof geo)[number], x: number, off: number[] = [0, 0, 0], s = 1): V3 =>
    [0, 1, 2].map(i => g.A[i] + g.R[0][i] * x + s * (g.R[0][i] * off[0] + g.R[1][i] * off[1] + g.R[2][i] * off[2])) as V3;
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const arrow = (tail: [number, number], tip: [number, number], colour: string, key: string, w = 1.5) => {
    const dx = tip[0] - tail[0], dy = tip[1] - tail[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, h = Math.min(7, l * 0.45);
    return <g key={key} stroke={colour} fill={colour} strokeWidth={w}>
      <line x1={tail[0]} y1={tail[1]} x2={tip[0] - ux * h * 0.8} y2={tip[1] - uy * h * 0.8} />
      <path stroke="none" d={`M${tip[0]} ${tip[1]}L${tip[0] - ux * h - uy * h * 0.4} ${tip[1] - uy * h + ux * h * 0.4}L${tip[0] - ux * h + uy * h * 0.4} ${tip[1] - uy * h - ux * h * 0.4}Z`} />
    </g>;
  };
  const text = (p: [number, number], s: React.ReactNode, key: string, colour = '#475569', anchor: 'start' | 'middle' | 'end' = 'middle', bold = false) =>
    <text key={key} x={p[0]} y={p[1]} fontSize={11} fontWeight={bold ? 600 : 400} textAnchor={anchor} fill={colour} style={halo}>{s}</text>;

  // ---- Rendered view: each member is its cross section extruded along its length
  const mesh = useMemo(() => {
    if (!opts.solid) return [];
    const secs = new Map(model.sections.map(x => [x.id, x]));
    const loopCache = new Map<number, [number, number][][]>();
    const loopsOf = (id: number) => {
      let l = loopCache.get(id);
      if (!l) { const sc = secs.get(id); l = sc ? outlineLoops(sc.outline ?? equivalentOutline(sc)) : outlineLoops({ shape: 'rect', dims: [200, 100] }); loopCache.set(id, l); }
      return l;
    };
    type Face = { id: number; pts: V3[]; n: V3; caps?: V3[][] };
    const faces: Face[] = [];
    for (const g of geo) {
      const loops = loopsOf(g.m.sec), at = (x: number, y: number, z: number): V3 => along(g, x, [0, y / 1000, z / 1000]);
      const dir = (y: number, z: number): V3 => [0, 1, 2].map(i => g.R[1][i] * y + g.R[2][i] * z) as V3;
      for (const l of loops) l.forEach((p, i) => {
        const q = l[(i + 1) % l.length], ny = q[1] - p[1], nz = -(q[0] - p[0]), len = Math.hypot(ny, nz) || 1;
        faces.push({ id: g.m.id, pts: [at(0, p[0], p[1]), at(0, q[0], q[1]), at(g.L, q[0], q[1]), at(g.L, p[0], p[1])], n: dir(ny / len, nz / len) });
      });
      for (const [x, sg] of [[0, -1], [g.L, 1]] as const)
        faces.push({ id: g.m.id, pts: [], n: g.R[0].map(v => v * sg) as V3, caps: loops.map(l => l.map(p => at(x, p[0], p[1]))) });
    }
    return faces;
  }, [opts.solid, geo, model.sections]); // eslint-disable-line react-hooks/exhaustive-deps
  const solids = useMemo(() => {
    if (!opts.solid) return [];
    const rz: V3 = [basis.rx[1] * basis.ry[2] - basis.rx[2] * basis.ry[1], basis.rx[2] * basis.ry[0] - basis.rx[0] * basis.ry[2], basis.rx[0] * basis.ry[1] - basis.rx[1] * basis.ry[0]]; // towards the viewer
    const light: V3 = [0, 1, 2].map(i => 0.55 * rz[i] - 0.35 * basis.rx[i] + 0.6 * basis.ry[i]) as V3, ll = Math.hypot(...light);
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const out: { id: number; d: string; depth: number; shade: number }[] = [];
    for (const f of mesh) {
      if (dot(f.n, rz) <= 1e-6) continue;
      const ring = f.caps ?? [f.pts], c = ring[0].reduce((m, p) => [m[0] + p[0] / ring[0].length, m[1] + p[1] / ring[0].length, m[2] + p[2] / ring[0].length], [0, 0, 0]) as V3;
      out.push({ id: f.id, depth: dot(c, rz), shade: 0.3 + 0.7 * Math.max(0, dot(f.n, light) / ll), d: ring.map(l => `${path(l.map(P))}Z`).join('') });
    }
    return out.sort((a, b) => a.depth - b.depth);
  }, [mesh, basis, P, opts.solid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Loads
  const loads: React.ReactNode[] = [];
  if (opts.loads && loadCases.length && !mode) {
    const fac = new Map(loadCases);
    const AX: Record<string, V3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
    const gById = new Map(geo.map(g => [g.m.id, g]));
    const wDir = (g: (typeof geo)[number], axes: string, dir: string): V3 => (axes === 'L' ? g.R[{ X: 0, Y: 1, Z: 2 }[dir.slice(-1)]!] as V3 : AX[dir.slice(-1)]);
    const dl = model.distLoads.filter(l => fac.has(l.lc) && gById.has(l.member)), pl = model.pointLoads.filter(l => fac.has(l.lc) && gById.has(l.member)), nls = model.nodeLoads.filter(l => fac.has(l.lc) && nodeMap.has(l.node));
    const wMax = Math.max(1e-9, ...dl.flatMap(l => [Math.abs(l.w1 * fac.get(l.lc)!), Math.abs(l.w2 * fac.get(l.lc)!)]));
    const fMax = Math.max(1e-9, ...pl.filter(l => l.dir.length === 1).map(l => Math.abs(l.p * fac.get(l.lc)!)), ...nls.flatMap(l => [l.fx, l.fy, l.fz].map(v => Math.abs(v * fac.get(l.lc)!))));
    dl.forEach((l, i) => {
      const g = gById.get(l.member)!, f = fac.get(l.lc)!, d = dirS(wDir(g, l.axes, l.dir)), s0 = l.s / 100 * g.L, s1 = l.e / 100 * g.L;
      const p0 = P(along(g, s0)), p1 = P(along(g, s1)), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (!d || len < 2) return;
      const n = Math.max(1, Math.round(len / 26)), tails: [number, number][] = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, w = (l.w1 + (l.w2 - l.w1) * t) * f, h = Math.abs(w) < 1e-12 ? 0 : 8 + 26 * Math.abs(w) / wMax, sg = Math.sign(w);
        const tip: [number, number] = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t], tail: [number, number] = [tip[0] - sg * d[0] * h, tip[1] - sg * d[1] * h];
        tails.push(tail); if (h > 0) loads.push(arrow(tail, tip, RED, `d${i}-${k}`, 1));
      }
      loads.push(<path key={`de${i}`} d={path(tails)} fill="none" stroke={RED} strokeWidth={1} />);
      const lab = Math.abs(l.w1 - l.w2) < 1e-9 ? fmt(l.w1 * f) : `${fmt(l.w1 * f)} to ${fmt(l.w2 * f)}`, mid = tails[Math.floor(n / 2)];
      if (opts.values) loads.push(text([mid[0] - Math.sign(l.w1 + l.w2 || 1) * d[0] * 8, mid[1] - Math.sign(l.w1 + l.w2 || 1) * d[1] * 8 + 4], `${lab} kN/m`, `dt${i}`, RED));
    });
    const force = (at: V3, d3: V3, v: number, key: string, unit: string, moment = false) => {
      if (Math.abs(v) < 1e-12) return;
      const d = dirS(d3), p = P(at); if (!d) { loads.push(<circle key={key} cx={p[0]} cy={p[1]} r={5} fill="none" stroke={RED} strokeWidth={1.5} />); return; }
      const h = moment ? 30 : 16 + 30 * Math.abs(v) / fMax, sg = Math.sign(v), tail: [number, number] = [p[0] - sg * d[0] * h, p[1] - sg * d[1] * h];
      loads.push(arrow(tail, p, RED, key, 1.75));
      if (moment) loads.push(arrow(tail, [p[0] - sg * d[0] * 8, p[1] - sg * d[1] * 8], RED, key + 'm', 1.75)); // double head: moment vector
      if (opts.values) loads.push(text([tail[0] - sg * d[0] * 8, tail[1] - sg * d[1] * 8 + 4], `${fmt(Math.abs(v))} ${unit}`, key + 't', RED));
    };
    pl.forEach((l, i) => { const g = gById.get(l.member)!, mom = l.dir.length === 2; force(along(g, l.pos / 100 * g.L), wDir(g, l.axes, l.dir), l.p * fac.get(l.lc)!, `p${i}`, mom ? 'kNm' : 'kN', mom); });
    nls.forEach((l, i) => {
      const n = nodeMap.get(l.node)!, f = fac.get(l.lc)!, at: V3 = [n.x, n.y, n.z];
      [l.fx, l.fy, l.fz].forEach((v, k) => force(at, AX['XYZ'[k]], v * f, `n${i}-${k}`, 'kN'));
      [l.mx, l.my, l.mz].forEach((v, k) => force(at, AX['XYZ'[k]], v * f, `nm${i}-${k}`, 'kNm', true));
    });
  }

  // ---- Results: diagrams, deflected shape, reactions
  const diag: React.ReactNode[] = [], taken = new Set<string>();
  const free = (p: [number, number]) => { const k = `${Math.round(p[0] / 26)},${Math.round(p[1] / 12)}`; if (taken.has(k)) return false; taken.add(k); return true; };
  if (result && opts.diagram !== 'none' && !mode) {
    const key = opts.diagram, colour = DIAGRAM_COLOUR[key];
    let vmax = 1e-9; result.members.forEach(r => { for (const v of r[key]) vmax = Math.max(vmax, Math.abs(v)); });
    const sc = 0.14 * bounds.S * opts.scale / vmax, axis = key === 'My' || key === 'Vz' ? 2 : 1, sign = key === 'Mz' ? -1 : 1; // moments on the tension side
    for (const g of geo) {
      const r = result.members.get(g.m.id); if (!r) continue;
      const off = (v: number) => { const o = [0, 0, 0]; o[axis] = sign * v * sc; return o; };
      const top = r.x.map((x, i) => P(along(g, x, off(r[key][i]))));
      diag.push(<path key={`g${g.m.id}`} d={`${path([P(g.A), ...top, P(g.B)])}Z`} fill={colour} fillOpacity={0.14} stroke={colour} strokeWidth={1.25} strokeLinejoin="round" />);
      if (opts.values) {
        let im = 0; r[key].forEach((v, i) => { if (Math.abs(v) > Math.abs(r[key][im])) im = i; });
        const lab = new Set([0, r.x.length - 1, im]);
        lab.forEach(i => { const v = r[key][i]; if ((Math.abs(v) > 1e-6 * vmax || i === im) && free(top[i])) diag.push(text([top[i][0], top[i][1] - 4], fmt(v), `gt${g.m.id}-${i}`, colour, 'middle', true)); });
      }
    }
  }
  const defl: React.ReactNode[] = [];
  const shape = mode ?? (opts.deflected && result ? result.disp : null);
  if (shape) {
    let dmax = 1e-12; shape.forEach(d => { dmax = Math.max(dmax, Math.hypot(d[0], d[1], d[2])); });
    if (!mode && result) result.members.forEach(r => r.dy.forEach((v, i) => { dmax = Math.max(dmax, Math.hypot(r.dx[i], v, r.dz[i])); }));
    const sc = 0.07 * bounds.S * opts.defScale / dmax;
    for (const g of geo) {
      const r = !mode && result ? result.members.get(g.m.id) : null; let pts: [number, number][];
      if (r) pts = r.x.map((x, i) => P(along(g, x, [r.dx[i], r.dy[i], r.dz[i]], sc)));
      else {
        const da = shape.get(g.m.a), db = shape.get(g.m.b); if (!da || !db) continue;
        const loc = (v: number[]) => g.R.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
        const u = [...loc(da.slice(0, 3)), ...loc(da.slice(3)), ...loc(db.slice(0, 3)), ...loc(db.slice(3))], L = g.L;
        pts = Array.from({ length: 13 }, (_, i) => {
          const t = i / 12, n1 = 1 - 3 * t * t + 2 * t ** 3, n2 = L * (t - 2 * t * t + t ** 3), n3 = 3 * t * t - 2 * t ** 3, n4 = L * (t ** 3 - t * t);
          return P(along(g, t * L, [u[0] + (u[6] - u[0]) * t, n1 * u[1] + n2 * u[5] + n3 * u[7] + n4 * u[11], n1 * u[2] - n2 * u[4] + n3 * u[8] - n4 * u[10]], sc));
        });
      }
      defl.push(<path key={`f${g.m.id}`} d={path(pts)} fill="none" stroke={PINK} strokeWidth={1.75} strokeLinejoin="round" />);
    }
    if (opts.values && !mode && result) {
      let worst: [number, number] | null = null; result.disp.forEach((d, id) => { const v = Math.hypot(d[0], d[1], d[2]); if (!worst || v > worst[1]) worst = [id, v]; });
      const w = worst as [number, number] | null, n = w && nodeMap.get(w[0]), d = w && result.disp.get(w[0]);
      if (n && d && w![1] > 0) { const p = P([n.x + d[0] * sc, n.y + d[1] * sc, n.z + d[2] * sc]); defl.push(text([p[0], p[1] - 8], `${fmt(w![1] * 1000)} mm`, 'dmax', PINK, 'middle', true)); }
    }
  }
  const reacts: React.ReactNode[] = [];
  if (result && opts.reactions && !mode) {
    const AX: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let rmax = 1e-9; result.reactions.forEach(r => r.slice(0, 3).forEach(v => { rmax = Math.max(rmax, Math.abs(v)); }));
    result.reactions.forEach((r, id) => {
      const n = nodeMap.get(id); if (!n) return; const p = P([n.x, n.y, n.z]);
      r.slice(0, 3).forEach((v, k) => {
        if (Math.abs(v) < 1e-4 * rmax) return; const d = dirS(AX[k]); if (!d) return;
        const sg = Math.sign(v), tail: [number, number] = [p[0] - sg * d[0] * 38, p[1] - sg * d[1] * 38];
        reacts.push(arrow(tail, [p[0] - sg * d[0] * 4, p[1] - sg * d[1] * 4], GREEN, `r${id}-${k}`, 2));
        reacts.push(text([tail[0] - sg * d[0] * 10, tail[1] - sg * d[1] * 10 + 4], fmt(Math.abs(v)), `rt${id}-${k}`, GREEN, 'middle', true));
      });
      const mom = r.slice(3).map((v, k) => (Math.abs(v) > 1e-6 ? `M${'xyz'[k]} ${fmt(v)}` : '')).filter(Boolean).join('  ');
      if (mom) reacts.push(text([p[0] + 10, p[1] + 26], mom, `rm${id}`, GREEN, 'start', true));
    });
  }

  // ---- Working plane grid (while drawing)
  const grid: React.ReactNode[] = [];
  if (tool !== 'select') {
    const [i, j, k] = opts.plane === 'XY' ? [0, 1, 2] : opts.plane === 'XZ' ? [0, 2, 1] : [1, 2, 0];
    let step = opts.snap > 0 ? opts.snap : 1; const pad = Math.max(2 * step, 0.25 * bounds.S);
    const lo = [bounds.lo[i] - pad, bounds.lo[j] - pad], hi = [bounds.hi[i] + pad, bounds.hi[j] + pad];
    while ((hi[0] - lo[0]) / step > 40 || (hi[1] - lo[1]) / step > 40) step *= 2;
    const pt = (a: number, b: number) => { const p: V3 = [0, 0, 0]; p[i] = a; p[j] = b; p[k] = opts.offset; return P(p); };
    const a0 = Math.floor(lo[0] / step) * step, a1 = Math.ceil(hi[0] / step) * step, b0 = Math.floor(lo[1] / step) * step, b1 = Math.ceil(hi[1] / step) * step;
    for (let a = a0; a <= a1 + 1e-9; a += step) { const p = pt(a, b0), q = pt(a, b1); grid.push(<line key={`ga${a}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#e2e8f0" strokeWidth={1} />); }
    for (let b = b0; b <= b1 + 1e-9; b += step) { const p = pt(a0, b), q = pt(a1, b); grid.push(<line key={`gb${b}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#e2e8f0" strokeWidth={1} />); }
  }

  const springNodes = new Set(model.springs.filter(s => s.k.some(v => v > 0)).map(s => s.node));
  const secName = new Map(model.sections.map(s => [s.id, s.name]));
  const chainNode = chain !== null ? nodeMap.get(chain) : null;
  const faded = !!(result || mode) && (opts.diagram !== 'none' || opts.deflected || !!mode);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none select-none" style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }} onContextMenu={e => e.preventDefault()}>
        <rect width={W} height={H} fill="#f8fafc" />
        {grid}
        {geo.map(g => {
          const p = P(g.A), q = P(g.B), on = sel.members.has(g.m.id), off = result?.members.get(g.m.id)?.active === false;
          return <line key={g.m.id} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={on ? BLUE : faded ? '#94a3b8' : '#334155'} strokeWidth={opts.solid ? 1.25 : on ? 3.5 : faded ? 1.5 : 2.25} strokeLinecap="round"
            strokeDasharray={!opts.solid && (off || g.m.type !== 'N') ? '6 4' : undefined} opacity={off ? 0.5 : 1} />;
        })}
        {opts.solid && <g strokeLinejoin="round" strokeWidth={0.75} pointerEvents="none">{solids.map((f, i) => {
          const on = sel.members.has(f.id), off = result?.members.get(f.id)?.active === false, lo = on ? [147, 197, 253] : faded ? [203, 213, 225] : [100, 116, 139], hi = on ? [29, 78, 216] : faded ? [226, 232, 240] : [226, 232, 240];
          const col = `rgb(${lo.map((v, k) => Math.round(v + (hi[k] - v) * f.shade)).join()})`;
          return <path key={i} d={f.d} fill={col} stroke={col} fillRule="evenodd" opacity={off ? 0.5 : 1} />;
        })}</g>}
        {opts.localAxes && geo.map(g => { const c = along(g, g.L / 2), p = P(c); return <g key={`ax${g.m.id}`}>{[RED, GREEN, BLUE].map((col, i) => { const d = dirS(g.R[i] as V3); return d && <line key={i} x1={p[0]} y1={p[1]} x2={p[0] + d[0] * 16} y2={p[1] + d[1] * 16} stroke={col} strokeWidth={1.5} />; })}</g>; })}
        {diag}{defl}{loads}
        {model.nodes.map(n => {
          const p = P([n.x, n.y, n.z]), r = (n.r || 'RRRRRR').toUpperCase(), t = r.slice(0, 3), on = sel.nodes.has(n.id);
          return <g key={n.id}>
            {r === 'FFFFFF' ? <path d={`M${p[0] - 8} ${p[1] + 3}h16v6h-16z`} fill="#64748b" />
              : t.startsWith('FF') ? <path d={`M${p[0]} ${p[1] + 2}l7 11h-14z`} style={{ fill: 'var(--color-white)' }} stroke="#64748b" strokeWidth={1.5} />
                : t[1] === 'F' ? <g stroke="#64748b" strokeWidth={1.5}><path d={`M${p[0]} ${p[1] + 2}l6 9h-12z`} style={{ fill: 'var(--color-white)' }} /><line x1={p[0] - 8} y1={p[1] + 14} x2={p[0] + 8} y2={p[1] + 14} /></g>
                  : t.includes('F') && r !== 'RRFFFR' ? <path d={`M${p[0]} ${p[1] + 2}l5 5l-5 5l-5 -5z`} style={{ fill: 'var(--color-white)' }} stroke="#64748b" strokeWidth={1.5} /> : null}
            {springNodes.has(n.id) && <path d={`M${p[0]} ${p[1] + 2}v3l-4 2l8 3l-8 3l8 3l-4 2v2m-6 0h12`} fill="none" stroke={AMBER} strokeWidth={1.5} />}
            <rect x={p[0] - (on ? 4 : 2.5)} y={p[1] - (on ? 4 : 2.5)} width={on ? 8 : 5} height={on ? 8 : 5} fill={on || chain === n.id ? BLUE : '#334155'} />
            {opts.nodeNo && text([p[0] + 6, p[1] - 6], n.id, `t${n.id}`, on ? BLUE : '#64748b', 'start')}
          </g>;
        })}
        {(opts.memberNo || opts.secNames) && geo.map(g => {
          const pa = P(g.A), pb = P(g.B), ll = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1, nx = -(pb[1] - pa[1]) / ll, ny = (pb[0] - pa[0]) / ll, sg = ny > 0.01 || (Math.abs(ny) <= 0.01 && nx > 0) ? -1 : 1;
          const p0 = P(along(g, g.L / 2)), p: [number, number] = [p0[0] + sg * nx * 10, p0[1] + sg * ny * 10 + 9], s = [opts.memberNo ? g.m.id : '', opts.secNames ? secName.get(g.m.sec) ?? '' : ''].filter(v => v !== '').join(': ');
          return text([p[0], p[1] - 5], s, `m${g.m.id}`, sel.members.has(g.m.id) ? BLUE : '#0f172a', 'middle', true);
        })}
        {reacts}
        {marq && <rect x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} fill={BLUE} fillOpacity={0.08} stroke={BLUE} strokeWidth={1}
          strokeDasharray={marq.x1 < marq.x0 ? '5 3' : undefined} pointerEvents="none" />}
        {chainNode && cursor && (() => { const p = P([chainNode.x, chainNode.y, chainNode.z]); return <line x1={p[0]} y1={p[1]} x2={cursor[0]} y2={cursor[1]} stroke={BLUE} strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />; })()}
        <g transform={`translate(34 ${H - 34})`}>
          {([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as V3[]).map((a, i) => {
            const x = basis.rx[0] * a[0] + basis.rx[1] * a[1] + basis.rx[2] * a[2], y = -(basis.ry[0] * a[0] + basis.ry[1] * a[1] + basis.ry[2] * a[2]), c = [RED, GREEN, BLUE][i];
            return <g key={i}><line x2={x * 22} y2={y * 22} stroke={c} strokeWidth={2} strokeLinecap="round" /><text x={x * 30} y={y * 30 + 4} fontSize={11} fontWeight={600} textAnchor="middle" fill={c}>{'XYZ'[i]}</text></g>;
          })}
        </g>
      </svg>
    </div>
  );
});
