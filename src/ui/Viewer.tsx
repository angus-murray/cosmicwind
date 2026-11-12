import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useElementSize } from 'engineering-ui';
import { releaseCode, restraintCode, type Model, type Note } from '../model/types';
import { outlineLoops, outlineOf } from '../model/sections';
import { memberAxes, type CaseResult, type Vec6 } from '../solver/frame';

export type StressKey = 'none' | 'normal' | 'axial' | 'mz' | 'my';
/** Stress results coloured on the rendered members: tension positive, from the axial force and the bending moments at each point of the section. */
export const STRESSES: { key: StressKey; label: string }[] = [
  { key: 'none', label: 'None' }, { key: 'normal', label: 'Normal Stress σ (N, Mz, My)' }, { key: 'axial', label: 'Axial Stress N/A' },
  { key: 'mz', label: 'Bending Stress (Mz)' }, { key: 'my', label: 'Bending Stress (My)' },
];
/** The colour scale of ConcreteSection2D: hue from blue (lowest) to red (highest), over the range of the values shown. */
const jetCss = (t: number) => `hsl(${(1 - Math.max(0, Math.min(1, t))) * 240}, 85%, 50%)`;
const jetRgb = (t: number) => {
  const h = (1 - Math.max(0, Math.min(1, t))) * 240, s = 0.85, l = 0.5, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, bl] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : [x, 0, c];
  return [r + m, g + m, bl + m].map(v => Math.round(v * 255));
};
type Face = { id: number; pts: V3[]; n: V3; caps?: V3[][]; /** Stress (MPa) for the colour map. */ v?: number };
export type DiagramKey = 'N' | 'T' | 'Vy' | 'Vz' | 'Vres' | 'Mz' | 'My' | 'Mres';
/** Member action diagrams that can be drawn together; each is scaled to its own maximum. */
export const DIAGRAMS: { key: DiagramKey; label: string; unit: string; colour: string }[] = [
  { key: 'N', label: 'Axial N', unit: 'kN', colour: '#ca8a04' }, { key: 'T', label: 'Torsion T', unit: 'kNm', colour: '#c026d3' },
  { key: 'Vy', label: 'Shear Vy', unit: 'kN', colour: '#0d9488' }, { key: 'Vz', label: 'Shear Vz', unit: 'kN', colour: '#0ea5e9' },
  { key: 'Vres', label: 'Shear Resultant', unit: 'kN', colour: '#15803d' },
  { key: 'Mz', label: 'Moment Mz', unit: 'kNm', colour: '#2563eb' }, { key: 'My', label: 'Moment My', unit: 'kNm', colour: '#7c3aed' },
  { key: 'Mres', label: 'Moment Resultant', unit: 'kNm', colour: '#be123c' },
];
/** A drawn diagram: its edge and the member axis at each result station, in screen pixels. */
interface Curve { key: DiagramKey; id: number; L: number; top: [number, number][]; axis: [number, number][]; xs: number[]; lines: (i: number, f: number) => string[] }
/** The diagram under the pointer: anywhere between the member and the edge of the diagram, or within a few pixels of either.
 *  The position along the member follows the pointer continuously, and the values are interpolated between stations. */
function pickCurve(curves: Curve[], px: number, py: number, tol = 7) {
  let best: { score: number; edgeDist: number; c: Curve; i: number; f: number; x: number; foot: [number, number]; edge: [number, number] } | null = null;
  for (const c of curves) for (let i = 0; i + 1 < c.xs.length; i++) {
    if (c.xs[i + 1] - c.xs[i] < 1e-9) continue; // a jump under a point load: covered by the neighbouring segments
    const a0 = c.axis[i], a1 = c.axis[i + 1], ux = a1[0] - a0[0], uy = a1[1] - a0[1], len = Math.hypot(ux, uy);
    if (len < 1e-6) continue;
    const tx = ux / len, ty = uy / len, nx = -ty, ny = tx, sRaw = ((px - a0[0]) * tx + (py - a0[1]) * ty) / len;
    if (sRaw < -tol / len || sRaw > 1 + tol / len) continue;
    const s = Math.min(1, Math.max(0, sRaw)), foot: [number, number] = [a0[0] + ux * s, a0[1] + uy * s];
    const o0 = [c.top[i][0] - a0[0], c.top[i][1] - a0[1]], o1 = [c.top[i + 1][0] - a1[0], c.top[i + 1][1] - a1[1]];
    const edge: [number, number] = [foot[0] + o0[0] + (o1[0] - o0[0]) * s, foot[1] + o0[1] + (o1[1] - o0[1]) * s];
    const on = (edge[0] - foot[0]) * nx + (edge[1] - foot[1]) * ny, dn = (px - foot[0]) * nx + (py - foot[1]) * ny;
    const lo = Math.min(0, on), hi = Math.max(0, on), across = dn < lo ? lo - dn : dn > hi ? dn - hi : 0, endGap = sRaw < 0 ? -sRaw * len : sRaw > 1 ? (sRaw - 1) * len : 0;
    const score = Math.hypot(across, endGap), edgeDist = Math.abs(dn - on);
    if (score > tol) continue;
    if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && edgeDist < best.edgeDist))
      best = { score, edgeDist, c, i, f: s, x: c.xs[i] + (c.xs[i + 1] - c.xs[i]) * s, foot, edge };
  }
  return best;
}
export type Tool = 'select' | 'node' | 'member' | 'measure';
/** Points clicked in empty space lie on the global XY plane (Z = 0), to the nearest millimetre. */
export interface ViewOpts {
  notes: boolean; nodeNo: boolean; memberNo: boolean; secNames: boolean; loads: boolean; localAxes: boolean;
  diagrams: Record<DiagramKey, boolean>; stress: StressKey; deflected: boolean; reactions: boolean; scale: number; defScale: number;
  /** Rendered 3D view of the member cross sections instead of the wireframe. */
  solid: boolean;
}
export interface Sel { nodes: Set<number>; members: Set<number> }
export interface ViewerHandle { fit: () => void; view: (v: 'iso' | 'front' | 'top' | 'side') => void; svg: () => SVGSVGElement | null }

type V3 = [number, number, number];
const RED = '#dc2626', GREEN = '#059669', BLUE = '#2563eb', PINK = '#c026d3', AMBER = '#d97706';
export const fmt = (v: number) => { const a = Math.abs(v); return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 0.01 || a === 0 ? v.toFixed(2) : v.toExponential(1)).replace('-', '−'); };
/** Member colour by section number: bright, well separated, and clear of the red, green and blue used for loads, reactions and selection. */
const SECTION_COLOURS = ['#7c3aed', '#0d9488', '#ea580c', '#db2777', '#0284c7', '#ca8a04', '#4f46e5', '#0891b2', '#c026d3', '#64748b'];
export const sectionColour = (id: number) => SECTION_COLOURS[(Math.max(1, Math.round(id)) - 1) % SECTION_COLOURS.length];
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixRgb = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const toHex = (c: number[]) => `rgb(${c.join()})`;
const halo: React.CSSProperties = { paintOrder: 'stroke', stroke: 'var(--color-slate-50)', strokeWidth: 3, strokeLinejoin: 'round' };

/** Breaks a note into lines of about 28 characters, keeping the line breaks the user typed. */
const wrapText = (t: string, max = 28) => t.split('\n').flatMap(p => {
  const out: string[] = []; let line = '';
  for (const w of p.split(/\s+/).filter(Boolean)) { if (line && (line + ' ' + w).length > max) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; }
  out.push(line); return out;
});

export const Viewer = React.forwardRef<ViewerHandle, {
  model: Model; opts: ViewOpts; tool: Tool; sel: Sel; onSelect: (s: Sel) => void;
  /** Loads to draw: load case id and factor. */
  loadCases: [number, number][];
  result?: CaseResult | null; mode?: Map<number, Vec6> | null;
  onAddNode: (p: V3) => number; onAddMember: (a: number, b: number) => void;
  /** Right click (without dragging) in the select tool: where, and the node or member under the pointer. */
  /** Changes when a different model is loaded, which refits the view. */
  fitRev?: number;
  /** A node placed on the midpoint of a member splits it there: returns the number of the new node. */
  onSplitMember?: (memberId: number) => number;
  /** Move or copy to a point: the point to pick the offset from, the nodes that travel, and what to do with the offset. */
  pick?: { base: V3; nodes: number[]; repeat: boolean; apply: (d: V3) => void } | null; onPickEnd?: () => void;
  /** Notes drawn as call-outs; a box can be dragged, and double-clicked to edit. */
  notes?: Note[]; onNoteMove?: (id: number, dx: number, dy: number) => void; onNoteEdit?: (id: number, x: number, y: number) => void;
  onContext?: (c: { x: number; y: number; node: number | null; member: number | null; note?: number | null; /** Node at the end of the member that was clicked near, if any. */ endNode: number | null }) => void;
}>(function Viewer({ model, opts, tool, sel, onSelect, loadCases, result, mode, onAddNode, onAddMember, onContext, fitRev = 0, pick, onPickEnd, onSplitMember, notes = [], onNoteMove, onNoteEdit }, handle) {
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
    const zoom = Math.min((W - 340) / Math.max(x1 - x0, 1e-6), (H - 190) / Math.max(y1 - y0, 1e-6), 400);
    setCam({ yaw, pitch, zoom, px: -zoom * (x0 + x1) / 2 + 4, py: zoom * (y0 + y1) / 2, c });
  }, [bounds, W, H]);
  const flat = bounds.hi[2] - bounds.lo[2] < 1e-9;
  useImperativeHandle(handle, () => ({
    fit: () => fitTo(cam.yaw, cam.pitch),
    view: v => (v === 'iso' ? fitTo(-0.5, 0.35) : v === 'front' ? fitTo(0, 0) : v === 'top' ? fitTo(0, Math.PI / 2) : fitTo(Math.PI / 2, 0)),
    svg: () => svgRef.current,
  }));
  // Fit when the size first becomes known and whenever a different model is loaded (its extents change).
  // Editing (deleting or moving nodes) never moves the camera: only the first display, a resize and a newly loaded model (fitRev) do.
  const fitKey = `${size.width > 0}|${Math.round(size.width / 40)}|${Math.round(size.height / 40)}|${fitRev}`;
  const lastFit = useRef(''), lastRev = useRef(fitRev);
  useEffect(() => {
    if (!size.width || lastFit.current === fitKey || tool !== 'select') return;
    const first = lastFit.current === '' || lastFit.current.startsWith('false'), loaded = lastRev.current !== fitRev; lastFit.current = fitKey; lastRev.current = fitRev;
    if (first || loaded) fitTo(flat ? 0 : -0.5, flat ? 0 : 0.35); else fitTo(cam.yaw, cam.pitch);
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Pointer interaction
  // Left drag: rotate. Left click: pick a node or member, or on empty space start a selection box that the next left click completes.
  // Middle drag: zoom (as does the wheel). Right drag: pan. Right click: options.
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; moved: boolean; mode: 'orbit' | 'zoom' | 'pan' | 'note' | null } | null>(null);
  const noteHit = useRef<number | null>(null);
  /** Measure tool: the two points, and the point under the pointer while the second is pending. */
  const [measure, setMeasure] = useState<{ a: V3 | null; b: V3 | null }>({ a: null, b: null });
  const [mLive, setMLive] = useState<V3 | null>(null);
  const [pickLive, setPickLive] = useState<V3 | null>(null);
  /** Member drawing: a length typed for the member, a global axis the member is held to, and the direction and length it has now. */
  const [lenText, setLenText] = useState('');
  const [lock, setLock] = useState<number | null>(null);
  const [guide, setGuide] = useState<{ axis: number | null; len: number } | null>(null);
  const dirRef = useRef<V3 | null>(null);
  const keyRef = useRef({ tool, chain: null as number | null, lenText: '', lock: null as number | null });
  const commitRef = useRef<() => void>(() => undefined);
  /** Where the drawing cursor lands (screen pixels) when a node, member midpoint or axis direction captures it. */
  const [snapAt, setSnapAt] = useState<[number, number] | null>(null);
  const [snapMid, setSnapMid] = useState(false);
  /** A call-out being dragged: its note, the box offset it started from and the pointer position. */
  const noteDrag = useRef<{ id: number; dx: number; dy: number; x: number; y: number } | null>(null);
  const [noteOff, setNoteOff] = useState<Record<number, [number, number]>>({});
  const faceHit = useRef<{ id: number; v?: number } | null>(null);
  const curvesRef = useRef<Curve[]>([]);
  /** Hover tip for the diagram curve under the pointer. */
  const [tip, setTip] = useState<{ x: number; y: number; dot: [number, number]; foot?: [number, number]; colour: string; lines: string[] } | null>(null);
  /** Node or member under the pointer, highlighted so the click target is clear. */
  const [hover, setHover] = useState<{ n: number | null; m: number | null }>({ n: null, m: null });
  /** First corner of a selection box that is waiting for its second click. */
  const anchor = useRef<[number, number] | null>(null);
  const local = (e: { clientX: number; clientY: number }): [number, number] => { const r = svgRef.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onPlane = (sx: number, sy: number): V3 | null => {
    const X = (sx - W / 2 - cam.px) / cam.zoom, Y = -(sy - H / 2 - cam.py) / cam.zoom;
    const [i, j, k] = [0, 1, 2];
    const { rx, ry } = basis, a = rx[i], b = rx[j], c = ry[i], d = ry[j], det = a * d - b * c;
    if (Math.abs(det) < 0.05) return null;
    const C = cam.c, ex = X - rx[k] * (0 - C[k]), ey = Y - ry[k] * (0 - C[k]), p: V3 = [0, 0, 0];
    p[i] = (ex * d - b * ey) / det + C[i]; p[j] = (a * ey - c * ex) / det + C[j]; p[k] = 0;
    return p.map(v => Math.round(v * 1e3) / 1e3) as V3;
  };
  /** The end point of the member being drawn: the pointer on the working plane, pulled onto a global axis through the start when within 8 degrees of it
   *  (as in Space Gass), or held on an axis typed with X, Y or Z. */
  const drawTarget = (lx: number, ly: number): { pt: V3; axis: number | null } | null => {
    const n = chain !== null ? nodeMap.get(chain) : null; if (!n) return null;
    const st: V3 = [n.x, n.y, n.z], r3 = (v: V3) => v.map(x => Math.round(x * 1e3) / 1e3) as V3;
    if (lock !== null) {
      const e: V3 = [0, 0, 0]; e[lock] = 1;
      const o = P(st), t = P([st[0] + e[0], st[1] + e[1], st[2] + e[2]]), vx = t[0] - o[0], vy = t[1] - o[1], vv = vx * vx + vy * vy; if (vv < 1e-6) return null;
      const pt: V3 = [...st]; pt[lock] = st[lock] + ((lx - o[0]) * vx + (ly - o[1]) * vy) / vv;
      return { pt: r3(pt), axis: lock };
    }
    const raw = onPlane(lx, ly); if (!raw) return null;
    const [i, j, k] = [0, 1, 2];
    const di = raw[i] - st[i], dj = raw[j] - st[j], tol = Math.tan(8 * Math.PI / 180), pt: V3 = [0, 0, 0]; pt[k] = 0;
    let axis: number | null = null;
    if (Math.abs(dj) < tol * Math.abs(di)) { axis = i; pt[i] = raw[i]; pt[j] = st[j]; }
    else if (Math.abs(di) < tol * Math.abs(dj)) { axis = j; pt[j] = raw[j]; pt[i] = st[i]; }
    else { pt[i] = raw[i]; pt[j] = raw[j]; }
    return { pt: r3(pt), axis };
  };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [sx, sy] = local(e);
    const nid = Number((e.target as Element).closest?.('[data-note]')?.getAttribute('data-note') ?? NaN), nt = notes.find(n => n.id === nid);
    noteHit.current = nt ? nt.id : null;
    if (nt && e.button === 0) { const o = noteOff[nt.id] ?? [nt.dx, nt.dy]; noteDrag.current = { id: nt.id, dx: o[0], dy: o[1], x: sx, y: sy }; }
    const mode = nt && e.button === 0 ? 'note' : e.button === 2 ? 'pan' : e.button === 1 ? 'zoom' : e.button === 0 ? 'orbit' : null;
    drag.current = { x: e.clientX, y: e.clientY, sx, sy, moved: false, mode };
  };
  const move = (e: React.PointerEvent) => {
    const [lx, ly] = local(e), dragging = !!drag.current?.moved;
    if (!dragging) {
      const h = hitAt(lx, ly), hn = h.hitN, hm = tool === 'select' && !pick ? h.hitM : null; // draw tools snap to nodes only
      setHover(v => (v.n === hn && v.m === hm ? v : { n: hn, m: hm }));
      const nr = hn === null ? pickCurve(curvesRef.current, lx, ly) : null; // the diagram, or the member it hangs from, under the pointer
      const fh = faceHit.current, stressTip = !nr && hn === null && stressOn && fh && fh.v !== undefined ? { x: lx, y: ly, dot: [lx, ly] as [number, number], colour: '#475569', lines: [`Member ${fh.id}`, `${STRESSES.find(t => t.key === opts.stress)!.label.replace(/ \(.*\)$/, '')}: ${fmt(fh.v)} MPa`] } : null;
      setTip(nr ? { x: lx, y: ly, dot: nr.edge, foot: nr.foot, colour: DIAGRAMS.find(d => d.key === nr.c.key)!.colour, lines: [`Member ${nr.c.id}, x = ${nr.x.toFixed(3)} m (${(100 * nr.x / nr.c.L).toFixed(0)}%)`, ...nr.c.lines(nr.i, nr.f)] } : stressTip);
      if (tool !== 'select' || pick) {
        const nn = hn !== null ? nodeMap.get(hn) : null, mid = !nn ? midAt(lx, ly) : null, drawing = tool === 'member' && chain !== null, dt = drawing && !nn && !mid ? drawTarget(lx, ly) : null;
        const pt: V3 | null = nn ? [nn.x, nn.y, nn.z] : mid ? mid.pt : dt ? dt.pt : onPlane(lx, ly), at = pt ? P(pt) : null;
        setSnapAt(nn || mid || dt ? at : null); setSnapMid(!!mid);
        if (drawing) {
          setCursor(at ?? [lx, ly]);
          const c = nodeMap.get(chain!); // direction and length so far, kept for a typed length
          if (c && pt) { const d = [pt[0] - c.x, pt[1] - c.y, pt[2] - c.z], len = Math.hypot(d[0], d[1], d[2]); dirRef.current = len > 1e-9 ? [d[0] / len, d[1] / len, d[2] / len] : null; setGuide({ axis: dt?.axis ?? null, len }); }
        }
        if (tool === 'measure' && measure.a && !measure.b) setMLive(pt ?? onPlane(lx, ly));
        if (pick) setPickLive(pt ?? onPlane(lx, ly));
      }
    } else {
      setHover(v => (v.n === null && v.m === null ? v : { n: null, m: null })); setSnapAt(null);
      if (tool === 'member' && chain !== null) setCursor([lx, ly]);
    }
    if (anchor.current) { const [x, y] = local(e); setMarq({ x0: anchor.current[0], y0: anchor.current[1], x1: x, y1: y }); }
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true; d.x = e.clientX; d.y = e.clientY;
    if (d.mode === 'note' && noteDrag.current) { const nd = noteDrag.current; nd.dx += dx; nd.dy += dy; setNoteOff({ [nd.id]: [nd.dx, nd.dy] }); }
    else if (d.mode === 'zoom') zoomAt(d.sx - W / 2, d.sy - H / 2, Math.exp(-dy * 0.01));
    else if (d.mode === 'pan') setCam(c => ({ ...c, px: c.px + dx, py: c.py + dy }));
    else if (d.mode === 'orbit') setCam(c => ({ ...c, yaw: c.yaw + dx * 0.008, pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, c.pitch + dy * 0.008)) }));
  };
  /** Nearest node within 9 px, else nearest member within 6 px. */
  /** The midpoint of a member within 9 px of the pointer: a snap point when drawing, measuring or moving. */
  const midAt = (sx: number, sy: number): { id: number; pt: V3 } | null => {
    let best = 9, out: { id: number; pt: V3 } | null = null;
    for (const g of geo) { const m: V3 = [(g.A[0] + g.B[0]) / 2, (g.A[1] + g.B[1]) / 2, (g.A[2] + g.B[2]) / 2], q = P(m), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < best) { best = d; out = { id: g.m.id, pt: m.map(v => Math.round(v * 1e6) / 1e6) as V3 }; } }
    return out;
  };
  const hitAt = (sx: number, sy: number): { hitN: number | null; hitM: number | null } => {
    let hitN: number | null = null, best = 9;
    for (const n of model.nodes) { const q = P([n.x, n.y, n.z]), dist = Math.hypot(q[0] - sx, q[1] - sy); if (dist < best) { best = dist; hitN = n.id; } }
    let hitM: number | null = null;
    if (hitN === null && opts.solid) { // rendered view: any point on a visible face of a member picks it (nearest face first)
      const inside = (polys: [number, number][][]) => { let c = false; for (const l of polys) for (let i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > sy) !== (l[j][1] > sy) && sx < (l[j][0] - l[i][0]) * (sy - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) c = !c; return c; };
      faceHit.current = null;
      for (let k = solids.length - 1; k >= 0; k--) { const f = solids[k]; if (sx >= f.x0 && sx <= f.x1 && sy >= f.y0 && sy <= f.y1 && inside(f.polys)) { faceHit.current = f; return { hitN: null, hitM: f.id }; } }
    }
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
    const nid = noteHit.current; noteHit.current = null;
    if (d.mode === 'note' && noteDrag.current) { const nd = noteDrag.current; noteDrag.current = null; if (d.moved) onNoteMove?.(nd.id, Math.round(nd.dx), Math.round(nd.dy)); setNoteOff({}); }
    if (d.moved) return;
    if (nid !== null) { if (e.button === 2) onContext?.({ x: sx, y: sy, node: null, member: null, note: nid, endNode: null }); return; }
    if (e.button === 2) {
      if (pick) { onPickEnd?.(); return; }
      if (anchor.current) { anchor.current = null; setMarq(null); return; }
      if (tool === 'select') {
        const h = hitAt(sx, sy), g = h.hitM !== null ? geo.find(x => x.m.id === h.hitM) : null;
        let endNode: number | null = null;
        if (g) { const pa = P(g.A), pb = P(g.B), da = Math.hypot(sx - pa[0], sy - pa[1]), db = Math.hypot(sx - pb[0], sy - pb[1]), len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); if (Math.min(da, db) < Math.max(14, 0.3 * len)) endNode = da < db ? g.m.a : g.m.b; }
        onContext?.({ x: sx, y: sy, node: h.hitN, member: h.hitM, endNode });
      } else { setChain(null); setMeasure({ a: null, b: null }); }
      return;
    }
    if (e.button !== 0) return;
    const { hitN, hitM } = hitAt(sx, sy);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (pick) { // move or copy to the point clicked: a node, or a point on the working plane
      const nn = hitN !== null ? nodeMap.get(hitN) : null, pt: V3 | null = nn ? [nn.x, nn.y, nn.z] : midAt(sx, sy)?.pt ?? onPlane(sx, sy); if (!pt) return;
      pick.apply([pt[0] - pick.base[0], pt[1] - pick.base[1], pt[2] - pick.base[2]]); if (!pick.repeat) onPickEnd?.();
      return;
    }
    if (tool === 'measure') { // first click, second click, then a new measurement
      const nn = hitN !== null ? nodeMap.get(hitN) : null, pt: V3 | null = nn ? [nn.x, nn.y, nn.z] : midAt(sx, sy)?.pt ?? onPlane(sx, sy); if (!pt) return;
      setMeasure(m => (m.a && !m.b ? { ...m, b: pt } : { a: pt, b: null })); setMLive(null);
      return;
    }
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
    if (id === null) {
      const mid = midAt(sx, sy);
      if (mid && onSplitMember) id = onSplitMember(mid.id);
      else { const dt = tool === 'member' && chain !== null ? drawTarget(sx, sy) : null, p = dt ? dt.pt : onPlane(sx, sy); if (!p) return; id = onAddNode(p); }
    }
    if (tool === 'member') { if (chain !== null && chain !== id) onAddMember(chain, id); setChain(id); setLock(null); setLenText(''); dirRef.current = null; setGuide(null); }
  };
  useEffect(() => { setChain(null); setCursor(null); anchor.current = null; setMarq(null); setMeasure({ a: null, b: null }); setMLive(null); setSnapAt(null); setSnapMid(false); setLock(null); setLenText(''); setGuide(null); dirRef.current = null; }, [tool]);
  keyRef.current = { tool, chain, lenText, lock };
  commitRef.current = () => { // place a member of the typed length along the current direction
    const c = chain !== null ? nodeMap.get(chain) : null, d = dirRef.current, L = Number(lenText);
    if (!c || !d || !(L > 0)) return;
    const pt = [c.x + d[0] * L, c.y + d[1] * L, c.z + d[2] * L].map(v => Math.round(v * 1e6) / 1e6) as V3, id = onAddNode(pt);
    if (id !== chain) onAddMember(chain!, id);
    setChain(id); setLenText(''); setLock(null); dirRef.current = null; setGuide(null);
  };
  useEffect(() => { // typed length, and X, Y, Z to hold the member to an axis; ahead of the app's own shortcuts
    const key = (e: KeyboardEvent) => {
      const k = keyRef.current; if (k.tool !== 'member' || k.chain === null || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (/^[0-9.]$/.test(e.key)) { eat(); setLenText(v => v + e.key); }
      else if (e.key === 'Backspace' && k.lenText) { eat(); setLenText(v => v.slice(0, -1)); }
      else if (e.key === 'Enter' && k.lenText) { eat(); commitRef.current(); }
      else if (e.key === 'Escape' && (k.lenText || k.lock !== null)) { eat(); setLenText(''); setLock(null); }
      else if (/^[xyz]$/i.test(e.key)) { eat(); const a = 'xyz'.indexOf(e.key.toLowerCase()); setLock(l => (l === a ? null : a)); }
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setChain(null); anchor.current = null; setMarq(null); setMeasure({ a: null, b: null }); } };
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
      if (!l) { const sc = secs.get(id); l = sc ? outlineLoops(outlineOf(sc)) : outlineLoops({ shape: 'rect', dims: [200, 100] }); loopCache.set(id, l); }
      return l;
    };
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
  const stressOn = !!result && !mode && opts.stress !== 'none' && opts.solid;
  /** The members cut into small faces along their length and around the section, each carrying the stress at its centre. */
  const stressMesh = useMemo(() => {
    if (!stressOn || !result) return { faces: [] as Face[], lo: 0, hi: 1 };
    const secs = new Map(model.sections.map(x => [x.id, x]));
    const loopsOf = (id: number) => { const sc = secs.get(id); return sc ? outlineLoops(outlineOf(sc)) : outlineLoops({ shape: 'rect', dims: [200, 100] }); };
    let est = 0; for (const g of geo) { const r = result.members.get(g.m.id); if (r) est += loopsOf(g.m.sec).reduce((a, l) => a + l.length * 3, 0) * r.x.length; }
    const stride = Math.max(1, Math.ceil(est / 60000)); // keeps very large models drawable
    const faces: Face[] = []; let lo = Infinity, hi = -Infinity;
    for (const g of geo) {
      const r = result.members.get(g.m.id), sc = secs.get(g.m.sec); if (!r) continue;
      const A = sc?.A || 1, Iy = sc?.Iy || 1, Iz = sc?.Iz || 1, loops = loopsOf(g.m.sec);
      const idx = r.x.map((_, i) => i).filter(i => i % stride === 0 || i === r.x.length - 1);
      const at = (x: number, y: number, z: number): V3 => along(g, x, [0, y / 1000, z / 1000]);
      const dir = (y: number, z: number): V3 => [0, 1, 2].map(i => g.R[1][i] * y + g.R[2][i] * z) as V3;
      const sigma = (i: number, y: number, z: number) => { // MPa: N in kN, M in kNm, section in mm
        const n = r.N[i] * 1000 / A, bz = -r.Mz[i] * 1e6 * y / Iz, by = r.My[i] * 1e6 * z / Iy;
        return opts.stress === 'axial' ? n : opts.stress === 'mz' ? bz : opts.stress === 'my' ? by : n + bz + by;
      };
      const size = Math.max(...loops[0].flatMap(p => [Math.abs(p[0]), Math.abs(p[1])])) * 2;
      for (const l of loops) l.forEach((p, e) => {
        const q = l[(e + 1) % l.length], ny = q[1] - p[1], nz = -(q[0] - p[0]), len = Math.hypot(ny, nz) || 1, nSeg = Math.max(1, Math.min(6, Math.ceil(len / (size * 0.18))));
        const nrm = dir(ny / len, nz / len);
        for (let j = 0; j < nSeg; j++) {
          const p0: [number, number] = [p[0] + (q[0] - p[0]) * j / nSeg, p[1] + (q[1] - p[1]) * j / nSeg], p1: [number, number] = [p[0] + (q[0] - p[0]) * (j + 1) / nSeg, p[1] + (q[1] - p[1]) * (j + 1) / nSeg];
          for (let k = 0; k + 1 < idx.length; k++) {
            const i0 = idx[k], i1 = idx[k + 1], x0 = r.x[i0], x1 = r.x[i1];
            const vs = [sigma(i0, p0[0], p0[1]), sigma(i0, p1[0], p1[1]), sigma(i1, p1[0], p1[1]), sigma(i1, p0[0], p0[1])];
            for (const v of vs) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
            faces.push({ id: g.m.id, pts: [at(x0, p0[0], p0[1]), at(x0, p1[0], p1[1]), at(x1, p1[0], p1[1]), at(x1, p0[0], p0[1])], n: nrm, v: (vs[0] + vs[1] + vs[2] + vs[3]) / 4 });
          }
        }
      });
      for (const [x, sg] of [[0, -1], [g.L, 1]] as const) faces.push({ id: g.m.id, pts: [], n: g.R[0].map(v => v * sg) as V3, caps: loops.map(l => l.map(p => at(x, p[0], p[1]))) });
    }
    const l0 = isFinite(lo) ? lo : 0, h0 = isFinite(hi) ? hi : 0;
    return { faces, lo: l0, hi: h0 - l0 < 1e-9 ? l0 + 1 : h0 };
  }, [stressOn, opts.stress, result, geo, model.sections]); // eslint-disable-line react-hooks/exhaustive-deps
  const faceSet = stressOn ? stressMesh.faces : mesh;
  const solids = useMemo(() => {
    if (!opts.solid) return [];
    const rz: V3 = [basis.rx[1] * basis.ry[2] - basis.rx[2] * basis.ry[1], basis.rx[2] * basis.ry[0] - basis.rx[0] * basis.ry[2], basis.rx[0] * basis.ry[1] - basis.rx[1] * basis.ry[0]]; // towards the viewer
    const light: V3 = [0, 1, 2].map(i => 0.55 * rz[i] - 0.35 * basis.rx[i] + 0.6 * basis.ry[i]) as V3, ll = Math.hypot(...light);
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const out: { id: number; d: string; depth: number; shade: number; polys: [number, number][][]; x0: number; x1: number; y0: number; y1: number; v?: number }[] = [];
    for (const f of faceSet) {
      if (dot(f.n, rz) <= 1e-6) continue;
      const ring = f.caps ?? [f.pts], c = ring[0].reduce((m, p) => [m[0] + p[0] / ring[0].length, m[1] + p[1] / ring[0].length, m[2] + p[2] / ring[0].length], [0, 0, 0]) as V3;
      const polys = ring.map(l => l.map(P)), xs = polys[0].map(q => q[0]), ys = polys[0].map(q => q[1]);
      out.push({ id: f.id, depth: dot(c, rz), shade: 0.3 + 0.7 * Math.max(0, dot(f.n, light) / ll), d: polys.map(l => `${path(l)}Z`).join(''), polys, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), v: f.v });
    }
    return out.sort((a, b) => a.depth - b.depth);
  }, [faceSet, basis, P, opts.solid]); // eslint-disable-line react-hooks/exhaustive-deps

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
      loads.push(text([mid[0] - Math.sign(l.w1 + l.w2 || 1) * d[0] * 8, mid[1] - Math.sign(l.w1 + l.w2 || 1) * d[1] * 8 + 4], `${lab} kN/m`, `dt${i}`, RED));
    });
    const force = (at: V3, d3: V3, v: number, key: string, unit: string, moment = false) => {
      if (Math.abs(v) < 1e-12) return;
      const d = dirS(d3), p = P(at); if (!d) { loads.push(<circle key={key} cx={p[0]} cy={p[1]} r={5} fill="none" stroke={RED} strokeWidth={1.5} />); return; }
      const h = moment ? 30 : 16 + 30 * Math.abs(v) / fMax, sg = Math.sign(v), tail: [number, number] = [p[0] - sg * d[0] * h, p[1] - sg * d[1] * h];
      loads.push(arrow(tail, p, RED, key, 1.75));
      if (moment) loads.push(arrow(tail, [p[0] - sg * d[0] * 8, p[1] - sg * d[1] * 8], RED, key + 'm', 1.75)); // double head: moment vector
      loads.push(text([tail[0] - sg * d[0] * 8, tail[1] - sg * d[1] * 8 + 4], `${fmt(Math.abs(v))} ${unit}`, key + 't', RED));
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
  /** Points of the drawn diagrams, kept for the hover tip. */
  const curves: Curve[] = [];
  const active = DIAGRAMS.filter(d => opts.diagrams[d.key]);
  if (result && active.length && !mode) {
    for (const { key, colour, unit } of active) {
      // Each action puts a vector in the plane of the section: the resultants use both components, so the side the curve is drawn on shows the direction
      const comp = (r: NonNullable<ReturnType<typeof result.members.get>>, i: number): [number, number] => // [local y, local z] offset per unit
        key === 'N' ? [r.N[i], 0] : key === 'T' ? [r.T[i], 0] : key === 'Vy' ? [r.Vy[i], 0] : key === 'Vz' ? [0, r.Vz[i]] : key === 'My' ? [0, r.My[i]] : key === 'Mz' ? [-r.Mz[i], 0]
          : key === 'Vres' ? [r.Vy[i], r.Vz[i]] : [-r.Mz[i], r.My[i]]; // moments are drawn on the tension side
      const mag = (r: NonNullable<ReturnType<typeof result.members.get>>, i: number) => { const c = comp(r, i); return key === 'Vres' || key === 'Mres' ? Math.hypot(c[0], c[1]) : key === 'Mz' ? -c[0] : c[0] + c[1]; };
      let vmax = 1e-9; result.members.forEach(r => r.x.forEach((_, i) => { const c = comp(r, i); vmax = Math.max(vmax, Math.hypot(c[0], c[1])); }));
      const sc = 0.14 * bounds.S * opts.scale / vmax, res = key === 'Vres' || key === 'Mres';
      for (const g of geo) {
        const r = result.members.get(g.m.id); if (!r) continue;
        const top = r.x.map((x, i) => { const c = comp(r, i); return P(along(g, x, [0, c[0] * sc, c[1] * sc])); });
        const k = `${key}${g.m.id}`;
        diag.push(<path key={`g${k}`} d={`${path([P(g.A), ...top, P(g.B)])}Z`} fill={colour} fillOpacity={res ? 0.08 : 0.14} stroke={colour} strokeWidth={1.25} strokeLinejoin="round" />);
        if (res) { const step = Math.max(1, Math.round(r.x.length / 10)); r.x.forEach((x, i) => { if (i % step === 0 && mag(r, i) > 1e-6 * vmax) { const q = P(along(g, x)); diag.push(<line key={`sp${k}-${i}`} x1={q[0]} y1={q[1]} x2={top[i][0]} y2={top[i][1]} stroke={colour} strokeOpacity={0.45} strokeWidth={1} />); } }); }
        {
          let im = 0; r.x.forEach((_, i) => { if (Math.abs(mag(r, i)) > Math.abs(mag(r, im))) im = i; });
          const lab = new Set([0, r.x.length - 1, im]);
          lab.forEach(i => { const v = mag(r, i); if ((Math.abs(v) > 1e-6 * vmax || i === im) && free(top[i])) diag.push(text([top[i][0], top[i][1] - 4], fmt(v), `gt${k}-${i}`, colour, 'middle', true)); });
        }
        const axis = r.x.map(x => P(along(g, x)));
        curves.push({ key, id: g.m.id, L: g.L, top, axis, xs: r.x, lines: (j, f) => { // the actions between stations j and j + 1, interpolated
          const lerp = (a: number[]) => [a[j] + (a[Math.min(j + 1, a.length - 1)] - a[j]) * f];
          const q = { N: lerp(r.N), T: lerp(r.T), Vy: lerp(r.Vy), Vz: lerp(r.Vz), My: lerp(r.My), Mz: lerp(r.Mz) } as unknown as typeof r, i = 0;
          const c = comp(q, i), out = [`${DIAGRAMS.find(d => d.key === key)!.label}: ${fmt(mag(q, i))} ${unit}`];
          if (key === 'Mres') out.push(`Mz ${fmt(q.Mz[i])}, My ${fmt(q.My[i])} kNm`);
          if (key === 'Vres') out.push(`Vy ${fmt(q.Vy[i])}, Vz ${fmt(q.Vz[i])} kN`);
          if (res) out.push(`Drawn at ${(((Math.atan2(c[1], c[0]) * 180 / Math.PI) % 360 + 360) % 360).toFixed(0)}° from local y towards z`);
          return out;
        } });
      }
    }
  }
  curvesRef.current = curves;
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
    if (!mode && result) {
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

  const memSec = new Map(model.members.map(m => [m.id, m.sec]));
  const legend = [...new Set(model.members.map(m => m.sec))].sort((a, b) => a - b);
  const springNodes = new Set(model.springs.filter(s => s.k.some(v => v > 0)).map(s => s.node));
  const secName = new Map(model.sections.map(s => [s.id, s.name]));
  const chainNode = chain !== null ? nodeMap.get(chain) : null;
  const faded = !stressOn && !!(result || mode) && (active.length > 0 || opts.deflected || !!mode);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none select-none" style={{ cursor: tool === 'select' && !pick ? 'default' : snapAt ? 'none' : 'crosshair' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { setHover({ n: null, m: null }); setSnapAt(null); setTip(null); }} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }} onContextMenu={e => e.preventDefault()}>
        <rect width={W} height={H} fill="#f8fafc" />
        {geo.map(g => {
          const p = P(g.A), q = P(g.B), on = sel.members.has(g.m.id), off = result?.members.get(g.m.id)?.active === false;
          const base = rgb(sectionColour(g.m.sec)), col = toHex(faded ? mixRgb(base, [148, 163, 184], 0.55) : base);
          return <g key={g.m.id}>
            {on && <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={BLUE} strokeWidth={opts.solid ? 7 : 8} strokeOpacity={0.35} strokeLinecap="round" />}
            <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={col} strokeWidth={opts.solid ? 1.25 : faded ? 1.75 : 2.75} strokeLinecap="round"
              strokeDasharray={!opts.solid && (off || g.m.type !== 'N') ? '6 4' : undefined} opacity={off ? 0.5 : 1} />
          </g>;
        })}
        {opts.solid && <g strokeLinejoin="round" strokeWidth={0.75} pointerEvents="none">{solids.map((f, i) => {
          const on = sel.members.has(f.id), off = result?.members.get(f.id)?.active === false;
          let col: string;
          if (stressOn) { const k = 0.72 + 0.28 * f.shade, c = f.v === undefined ? [203, 213, 225] : jetRgb((f.v - stressMesh.lo) / (stressMesh.hi - stressMesh.lo)); col = toHex(c.map(v => Math.round(v * k))); }
          else {
            let base = rgb(sectionColour(memSec.get(f.id) ?? 1)); if (faded) base = mixRgb(base, [226, 232, 240], 0.55); if (on) base = mixRgb(base, rgb(BLUE), 0.4);
            col = toHex(mixRgb(mixRgb(base, [15, 23, 42], 0.5), mixRgb(base, [255, 255, 255], 0.5), f.shade));
          }
          return <path key={i} d={f.d} fill={col} stroke={col} fillRule="evenodd" opacity={off ? 0.5 : 1} />;
        })}</g>}
        {hover.m !== null && (() => { const g = geo.find(x => x.m.id === hover.m); if (!g) return null; const p = P(g.A), q = P(g.B); return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={AMBER} strokeWidth={9} strokeOpacity={0.4} strokeLinecap="round" pointerEvents="none" />; })()}
        {geo.flatMap(g => ([['A', g.m.relA, g.A, g.B], ['B', g.m.relB, g.B, g.A]] as const).map(([end, relRaw, at, from]) => {
          const rel = releaseCode(relRaw); if (!rel.includes('R')) return null;
          const p0 = P(at), p1 = P(from), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (len < 28) return null;
          const u = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len], nx = -u[1], ny = u[0], pt = (k: number): [number, number] => [p0[0] + u[0] * k, p0[1] + u[1] * k];
          const bend = rel[4] === 'R' || rel[5] === 'R', tors = rel[3] === 'R', slide = rel.slice(0, 3).includes('R'), m = pt(8), f = pt(bend || tors ? 18 : 9);
          const names = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'].filter((_, i) => rel[i] === 'R').join(', ');
          return <g key={`rel${g.m.id}${end}`} stroke="#334155" strokeWidth={1.5} fill="#fff"><title>{`Member ${g.m.id}, end ${end === 'A' ? 1 : 2}: released ${names}`}</title>
            {bend && <circle cx={m[0]} cy={m[1]} r={4.5} />}
            {!bend && tors && <path d={`M${m[0]} ${m[1] - 4.5}l4.5 4.5l-4.5 4.5l-4.5 -4.5z`} />}
            {slide && <path fill="none" d={`M${f[0] - u[0] * 2 + nx * 5} ${f[1] - u[1] * 2 + ny * 5}L${f[0] - u[0] * 2 - nx * 5} ${f[1] - u[1] * 2 - ny * 5}M${f[0] + u[0] * 2 + nx * 5} ${f[1] + u[1] * 2 + ny * 5}L${f[0] + u[0] * 2 - nx * 5} ${f[1] + u[1] * 2 - ny * 5}`} />}
          </g>;
        }))}
        {opts.localAxes && geo.map(g => { const c = along(g, g.L / 2), p = P(c); return <g key={`ax${g.m.id}`}>{[RED, GREEN, BLUE].map((col, i) => { const d = dirS(g.R[i] as V3); return d && <line key={i} x1={p[0]} y1={p[1]} x2={p[0] + d[0] * 16} y2={p[1] + d[1] * 16} stroke={col} strokeWidth={1.5} />; })}</g>; })}
        {diag}{defl}{loads}
        {model.nodes.map(n => {
          const p = P([n.x, n.y, n.z]), r = restraintCode(n.r), t = r.slice(0, 3), on = sel.nodes.has(n.id);
          return <g key={n.id}>
            {r === 'FFFFFF' ? <path d={`M${p[0] - 8} ${p[1] + 3}h16v6h-16z`} fill="#64748b" />
              : t.startsWith('FF') ? <path d={`M${p[0]} ${p[1] + 2}l7 11h-14z`} style={{ fill: 'var(--color-white)' }} stroke="#64748b" strokeWidth={1.5} />
                : t[1] === 'F' ? <g stroke="#64748b" strokeWidth={1.5}><path d={`M${p[0]} ${p[1] + 2}l6 9h-12z`} style={{ fill: 'var(--color-white)' }} /><line x1={p[0] - 8} y1={p[1] + 14} x2={p[0] + 8} y2={p[1] + 14} /></g>
                  : t.includes('F') && r !== 'RRFFFR' ? <path d={`M${p[0]} ${p[1] + 2}l5 5l-5 5l-5 -5z`} style={{ fill: 'var(--color-white)' }} stroke="#64748b" strokeWidth={1.5} /> : null}
            {springNodes.has(n.id) && <path d={`M${p[0]} ${p[1] + 2}v3l-4 2l8 3l-8 3l8 3l-4 2v2m-6 0h12`} fill="none" stroke={AMBER} strokeWidth={1.5} />}
            {hover.n === n.id && <circle cx={p[0]} cy={p[1]} r={9} fill={AMBER} fillOpacity={0.3} stroke={AMBER} strokeWidth={2} pointerEvents="none" />}
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
        {opts.notes && notes.map(n => {
          const q = n.kind === 'node' ? nodeMap.get(n.ref) : null, g = n.kind === 'member' ? geo.find(x => x.m.id === n.ref) : null;
          const a = q ? P([q.x, q.y, q.z]) : g ? P([(g.A[0] + g.B[0]) / 2, (g.A[1] + g.B[1]) / 2, (g.A[2] + g.B[2]) / 2]) : null; if (!a) return null;
          const lines = wrapText(n.text), off = noteOff[n.id] ?? [n.dx, n.dy], w = Math.max(48, Math.min(210, Math.max(...lines.map(l => l.length)) * 6 + 14)), h = lines.length * 14 + 8, x = a[0] + off[0], y = a[1] + off[1] - h;
          const [bx, ey] = ([[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as [number, number][]).reduce((c, q) => (Math.hypot(q[0] - a[0], q[1] - a[1]) < Math.hypot(c[0] - a[0], c[1] - a[1]) ? q : c)); // the leader starts at the nearest corner
          return <g key={`note${n.id}`} data-note={n.id} style={{ cursor: 'move' }} onDoubleClick={e => { const [lx, ly] = local(e); onNoteEdit?.(n.id, lx, ly); }}>
            <title>Drag to move, double-click to edit, right-click for options</title>
            <line x1={bx} y1={ey} x2={a[0]} y2={a[1]} stroke="#000" strokeWidth={1} />
            <rect x={x} y={y} width={w} height={h} fill="#fef08a" stroke="#000" strokeWidth={1} />
            <circle cx={a[0]} cy={a[1]} r={2.5} fill="#000" />
            {lines.map((l, i) => <text key={i} x={x + 7} y={y + 15 + i * 14} fontSize={11} fill="#000" style={{ userSelect: 'none' }}>{l}</text>)}
          </g>;
        })}
        {marq && <rect x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} fill={BLUE} fillOpacity={0.08} stroke={BLUE} strokeWidth={1}
          strokeDasharray={marq.x1 < marq.x0 ? '5 3' : undefined} pointerEvents="none" />}
        {pick && pickLive && (() => {
          const d: V3 = [pickLive[0] - pick.base[0], pickLive[1] - pick.base[1], pickLive[2] - pick.base[2]], set = new Set(pick.nodes);
          const at = (id: number): [number, number] | null => { const n = nodeMap.get(id); return n ? P(set.has(id) ? [n.x + d[0], n.y + d[1], n.z + d[2]] : [n.x, n.y, n.z]) : null; };
          const pb = P(pick.base), pt = P(pickLive), fm = (v: number) => v.toFixed(3).replace('-', '−');
          return <g pointerEvents="none" stroke={AMBER} strokeWidth={1.75} strokeDasharray="5 3" fill="none">
            {model.members.filter(m => set.has(m.a) || set.has(m.b)).map(m => { const p = at(m.a), q = at(m.b); return p && q ? <line key={m.id} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} /> : null; })}
            {pick.nodes.map(id => { const q = at(id); return q ? <rect key={id} x={q[0] - 3} y={q[1] - 3} width={6} height={6} fill={AMBER} stroke="none" /> : null; })}
            <line x1={pb[0]} y1={pb[1]} x2={pt[0]} y2={pt[1]} strokeWidth={1} />
            {text([(pb[0] + pt[0]) / 2, (pb[1] + pt[1]) / 2 - 8], `ΔX ${fm(d[0])}  ΔY ${fm(d[1])}  ΔZ ${fm(d[2])}`, 'pklbl', '#b45309', 'middle', true)}
          </g>;
        })()}
        {measure.a && (() => {
          const a = measure.a, b = measure.b ?? mLive, pa = P(a); if (!b) return <circle cx={pa[0]} cy={pa[1]} r={4} fill={AMBER} pointerEvents="none" />;
          const pb = P(b), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], mid: [number, number] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], sg = (v: number) => v.toFixed(3).replace('-', '−');
          return <g pointerEvents="none"><line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={AMBER} strokeWidth={1.75} strokeDasharray={measure.b ? undefined : '5 4'} />
            <circle cx={pa[0]} cy={pa[1]} r={4} fill={AMBER} /><circle cx={pb[0]} cy={pb[1]} r={4} fill={AMBER} />
            {text([mid[0], mid[1] - 9], `${Math.hypot(d[0], d[1], d[2]).toFixed(3)} m`, 'mlen', '#b45309', 'middle', true)}
            {text([mid[0], mid[1] + 14], `ΔX ${sg(d[0])}   ΔY ${sg(d[1])}   ΔZ ${sg(d[2])}`, 'mdel', '#475569')}</g>;
        })()}
        {snapAt && (tool !== 'select' || !!pick) && (snapMid
          ? <g pointerEvents="none" stroke="#0d9488" strokeWidth={2} fill="#fff" fillOpacity={0.6}><path d={`M${snapAt[0]} ${snapAt[1] - 7}L${snapAt[0] + 7} ${snapAt[1] + 5}L${snapAt[0] - 7} ${snapAt[1] + 5}Z`} /></g>
          : <g pointerEvents="none" stroke={hover.n !== null ? AMBER : BLUE} strokeWidth={1.5} fill="none"><path d={`M${snapAt[0] - 8} ${snapAt[1]}h16M${snapAt[0]} ${snapAt[1] - 8}v16`} /><rect x={snapAt[0] - 4} y={snapAt[1] - 4} width={8} height={8} /></g>)}
        {chainNode && cursor && tool === 'member' && (() => {
          const p = P([chainNode.x, chainNode.y, chainNode.z]), col = guide?.axis != null ? [RED, GREEN, BLUE][guide.axis] : BLUE, mid: [number, number] = [(p[0] + cursor[0]) / 2, (p[1] + cursor[1]) / 2];
          const shown = lenText ? `${lenText} m` : guide && guide.len > 1e-9 ? `${guide.len.toFixed(3)} m` : '';
          return <g pointerEvents="none"><line x1={p[0]} y1={p[1]} x2={cursor[0]} y2={cursor[1]} stroke={col} strokeWidth={guide?.axis != null ? 2 : 1.5} strokeDasharray={lenText ? undefined : '5 4'} />
            {guide?.axis != null && text([cursor[0] + 10, cursor[1] - 8], `${'XYZ'[guide.axis]} axis`, 'axl', col, 'start', true)}
            {shown && (lenText ? <g><rect x={mid[0] - 38} y={mid[1] - 24} width={76} height={18} rx={3} fill="#fff" stroke={col} />{text([mid[0], mid[1] - 11], `${shown}▏`, 'lenbox', '#0f172a', 'middle', true)}</g> : text([mid[0], mid[1] - 8], shown, 'lenlive', '#475569'))}
          </g>;
        })()}
        <g transform={`translate(34 ${H - 34})`}>
          {([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as V3[]).map((a, i) => {
            const x = basis.rx[0] * a[0] + basis.rx[1] * a[1] + basis.rx[2] * a[2], y = -(basis.ry[0] * a[0] + basis.ry[1] * a[1] + basis.ry[2] * a[2]), c = [RED, GREEN, BLUE][i];
            return <g key={i}><line x2={x * 22} y2={y * 22} stroke={c} strokeWidth={2} strokeLinecap="round" /><text x={x * 30} y={y * 30 + 4} fontSize={11} fontWeight={600} textAnchor="middle" fill={c}>{'XYZ'[i]}</text></g>;
          })}
        </g>
      </svg>
      {stressOn && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-white/95 border border-slate-200 shadow-2xs rounded px-3 py-1.5 text-[11px] text-slate-600 tabular-nums pointer-events-none">
        <div className="font-semibold text-slate-700 mb-0.5 text-center">{STRESSES.find(t => t.key === opts.stress)!.label}</div>
        <div className="flex items-center gap-2"><span>{fmt(stressMesh.lo)} MPa</span><span className="w-36 h-2.5 rounded-sm" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(jetCss).join(', ')})` }} /><span>{fmt(stressMesh.hi)} MPa</span></div>
      </div>}
      {tip && <>
        <svg width={W} height={H} className="absolute inset-0 pointer-events-none">{tip.foot && <><line x1={tip.foot[0]} y1={tip.foot[1]} x2={tip.dot[0]} y2={tip.dot[1]} stroke={tip.colour} strokeWidth={1.25} /><circle cx={tip.foot[0]} cy={tip.foot[1]} r={2.5} fill={tip.colour} /></>}<circle cx={tip.dot[0]} cy={tip.dot[1]} r={4.5} fill="#fff" stroke={tip.colour} strokeWidth={2} /></svg>
        <div className="absolute z-10 pointer-events-none bg-white/95 border border-slate-200 rounded-md shadow-md px-2 py-1 text-[11px] text-slate-700 whitespace-nowrap" style={{ left: Math.min(tip.x + 14, W - 230), top: Math.min(tip.y + 14, H - 70) }}>
          {tip.lines.map((l, i) => <div key={i} className={i === 1 ? 'font-semibold' : ''} style={i === 1 ? { color: tip.colour } : undefined}>{l}</div>)}
        </div>
      </>}
      {legend.length > 0 && <div className="absolute bottom-2 left-20 max-w-[45%] bg-white/85 border border-slate-200 rounded-md px-2 py-1 text-[11px] text-slate-700 space-y-0.5 pointer-events-none">
        {legend.slice(0, 8).map(id => <div key={id} className="flex items-center gap-1.5 whitespace-nowrap"><span className="inline-block w-3 h-1.5 rounded-sm shrink-0" style={{ background: sectionColour(id) }} />{id}: {secName.get(id) ?? '—'}</div>)}
        {legend.length > 8 && <div>+{legend.length - 8} more</div>}
      </div>}
    </div>
  );
});
