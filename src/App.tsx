import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, Banner, Segmented, useElementSize, Check, NumberField, ReportDialog, SelectField, StatusChip, today } from 'engineering-ui';
import { Axis3d, Box, Eye, Ruler, FilePlus, FolderOpen, Hash, Maximize, MousePointer2, Redo2, Save, Spline, Trash2, Type, Undo2, Weight, Dot, LineChart, Shapes, Cuboid, Waypoints, StickyNote, Anchor, Unlink } from 'lucide-react';
import {
  deleteMembersAndFreeNodes, deleteNodes, DASH, FREE, MATERIAL_PRESETS, nextId, normalise, RELEASES, RESTRAINTS,
  type Combo, type DistLoad, type LoadCase, type Material, type Member, type Model, type Node, type NodeLoad, type NodeMass, type PointLoad, type Section, type Settlement, type ThermalLoad,
} from './model/types';
import { defaultModel } from './model/templates';
import { analyse } from './solver/frame';
import { type DofSpec } from './ui/DofEditor';
import { Sheet, type Col } from './ui/Sheet';
import { DIAGRAMS, STRESSES, Viewer, type DiagramKey, type StressKey, type Sel, type Tool, type ViewerHandle, type ViewOpts } from './ui/Viewer';
import { ContextMenu, PromptBox, TextPromptBox, ToolFlyout, type MenuItem, type MenuState, type PromptState, type TextPromptState } from './ui/CanvasMenu';
import { About, LoadDialog, SectionDialog, TemplateDialog, type LoadSpec } from './ui/Dialogs';
import type { ReportInfo } from './report';

type Tab = 'structure' | 'loads' | 'results';
const STORE = 'moonrock-model';
const load = (): Model => { try { const s = localStorage.getItem(STORE); if (s) return normalise(JSON.parse(s)); } catch { /* fall through */ } return defaultModel(); };
const code = (v: string | number, old: string) => { const s = String(v).toUpperCase().trim(); return /^[-–—]?$/.test(s) ? DASH : /^[FRS]{6}$/.test(s) ? s : old; };
/** The member action diagrams, grouped as the Diagrams panel lists them: [key, label]. */
const DIAGRAM_GROUPS: { title: string; items: [DiagramKey, string][] }[] = [
  { title: 'Axial Force', items: [['N', 'N']] },
  { title: 'Torsion', items: [['T', 'T']] },
  { title: 'Shear', items: [['Vy', 'Vy'], ['Vz', 'Vz'], ['Vres', 'Resultant']] },
  { title: 'Bending', items: [['Mz', 'Mz'], ['My', 'My'], ['Mres', 'Resultant']] },
];
/** A force or moment symbol in italics with an upright subscript, or plain text. */
const symbol = (t: string) => (/^[NT]$/.test(t) ? <i>{t}</i> : /^[VM][yz]$/.test(t) ? <><i>{t[0]}</i><sub>{t[1]}</sub></> : t);
const opt = (rows: { id: number; name?: string }[]) => rows.map(r => ({ value: String(r.id), label: r.name ? `${r.id}: ${r.name}` : String(r.id) }));
const noSel = (): Sel => ({ nodes: new Set(), members: new Set() });

export default function App() {
  const [hist, setHist] = useState(() => ({ past: [] as Model[], now: load(), future: [] as Model[] }));
  const model = hist.now;
  const setModel = useCallback((f: (m: Model) => Model) => setHist(h => { const n = f(h.now); return n === h.now ? h : { past: [...h.past.slice(-99), h.now], now: n, future: [] }; }), []);
  const undo = useCallback(() => setHist(h => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist(h => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h)), []);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(model)); } catch { /* storage unavailable */ } }, [model]);
  const set = <K extends keyof Model>(k: K) => (v: Model[K]) => setModel(m => ({ ...m, [k]: v }));

  const [tab, setTab] = useState<Tab>('structure');
  const [sub, setSub] = useState({ structure: 'nodes', loads: 'cases' });
  const [sel, setSel] = useState<Sel>(noSel);
  const [tool, setTool] = useState<Tool>('select');
  const [opts, setOpts] = useState<ViewOpts>({ notes: true, nodeNo: false, memberNo: false, secNames: false, loads: true, localAxes: false, diagrams: { N: false, T: false, Vy: false, Vz: false, Vres: false, Mz: true, My: false, Mres: false }, stress: 'none', deflected: false, defLabels: 'none', restraints: true, releases: true, reactions: true, scale: 1, defScale: 1, solid: false });
  const o = <K extends keyof ViewOpts>(k: K) => (v: ViewOpts[K]) => setOpts(p => ({ ...p, [k]: v }));
  const [caseId, setCaseId] = useState(1);
  const [modeIx, setModeIx] = useState<{ kind: 'buckling' | 'modal'; i: number } | null>(null);
  const [dialog, setDialog] = useState<'about' | 'report' | 'new' | 'section' | 'load' | null>(null);
  const [assignOnAdd, setAssignOnAdd] = useState(false);
  /** Section and material given to the members drawn with the Member tool; unset follows the last member. */
  const [drawSec, setDrawSec] = useState<number | null>(null), [drawMat, setDrawMat] = useState<number | null>(null), [assignDraw, setAssignDraw] = useState(false);
  /** Section number whose type is being changed in the section dialog, or null when adding a section. */
  const [replaceSec, setReplaceSec] = useState<number | null>(null);
  const [secSel, setSecSel] = useState<number | null>(null);
  const [loadKind, setLoadKind] = useState<'node' | 'member'>('node');
  const [info, setInfo] = useState<ReportInfo>({ project: '', number: '', structure: '', designer: '', date: today() });
  const viewer = useRef<ViewerHandle>(null);
  const [fitRev, setFitRev] = useState(0);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [textPrompt, setTextPrompt] = useState<TextPromptState | null>(null);
  const [pickMove, setPickMove] = useState<{ base: [number, number, number]; nodes: number[]; repeat: boolean; apply: (d: [number, number, number]) => void } | null>(null);
  const [cvRef, cvSize] = useElementSize<HTMLDivElement>();
  const [ctx, setCtx] = useState<{ x: number; y: number; node: number | null; member: number | null; note?: number | null; endNode: number | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cases = useMemo(() => [...model.loadCases.map(c => ({ id: c.id, name: c.name, combo: false })), ...model.combos.map(c => ({ id: c.id, name: c.name, combo: true }))], [model.loadCases, model.combos]);
  const cur = cases.find(c => c.id === caseId) ?? cases[0];
  const lcOnly = model.loadCases.find(c => c.id === cur?.id)?.id ?? model.loadCases[0]?.id ?? 1;
  const drawLoads = useMemo<[number, number][]>(() => {
    const cb = model.combos.find(c => c.id === cur?.id);
    return cb ? Object.entries(cb.f).filter(e => e[1]).map(([k, v]) => [Number(k), v]) : cur ? [[cur.id, 1]] : [];
  }, [model.combos, cur]);

  /** Gravity of the case shown (multipliers of g in X, Y, Z), summed over the cases of a combination. */
  const gravity = useMemo(() => {
    const g = [0, 0, 0];
    for (const [id, f] of drawLoads) { const c = model.loadCases.find(x => x.id === id); if (c) { g[0] += f * (c.gx || 0); g[1] += f * (c.gy || 0); g[2] += f * (c.gz || 0); } }
    return g.map(v => Math.round(v * 1e6) / 1e6);
  }, [drawLoads, model.loadCases]);
  const analysis = useMemo(() => (tab === 'results' ? analyse(model) : null), [model, tab]);
  const res = analysis?.cases.find(c => c.id === cur?.id) ?? null;
  const okRes = res && !res.error ? res : null;
  const modeShape = !okRes || !modeIx ? null : (modeIx.kind === 'modal' ? analysis?.modal : okRes.buckling)?.shapes[modeIx.i] ?? null;

  // ---- Editing actions
  const ensureSection = (m: Model): Model => (m.sections.length ? m : { ...m, sections: [{ id: 1, name: 'Section 1', A: 5210, Iy: 7650000, Iz: 86400000, J: 157000 }] });
  const addNode = (p: [number, number, number]) => {
    const hit = model.nodes.find(n => Math.hypot(n.x - p[0], n.y - p[1], n.z - p[2]) < 1e-6); if (hit) return hit.id;
    const id = nextId(model.nodes); setModel(m => ({ ...m, nodes: [...m.nodes, { id, x: p[0], y: p[1], z: p[2], r: FREE }] })); return id;
  };
  const addMember = (a: number, b: number) => setModel(m0 => {
    const m = ensureSection(m0); if (m.members.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return m0;
    const last = m.members[m.members.length - 1];
    return { ...m, members: [...m.members, { id: nextId(m.members), a, b, sec: m.sections.some(s => s.id === drawSec) ? drawSec! : last?.sec ?? m.sections[0].id, mat: m.materials.some(s => s.id === drawMat) ? drawMat! : last?.mat ?? m.materials[0]?.id ?? 1, angle: 0, type: 'N', relA: DASH, relB: DASH }] };
  });
  const delSel = useCallback(() => { setModel(m => deleteNodes(deleteMembersAndFreeNodes(m, sel.members), sel.nodes)); setSel(noSel()); }, [sel, setModel]);
  const patchMembers = (p: Partial<Member>) => setModel(m => ({ ...m, members: m.members.map(x => (sel.members.has(x.id) ? { ...x, ...p } : x)) }));
  const patchNodes = (p: Partial<Node>) => setModel(m => ({ ...m, nodes: m.nodes.map(x => (sel.nodes.has(x.id) ? { ...x, ...p } : x)) }));
  const subdivide = (np: number = 4, which: Set<number> = sel.members) => setModel(m => {
    const n = Math.max(2, Math.round(np)), nodes = m.nodes.slice(), members: Member[] = [], out = { ...m };
    let nid = nextId(nodes), mid = nextId(m.members);
    const dist: DistLoad[] = [], point: PointLoad[] = [], thermal: ThermalLoad[] = [];
    for (const mb of m.members) {
      const a = nodes.find(x => x.id === mb.a), b = nodes.find(x => x.id === mb.b);
      if (!which.has(mb.id) || !a || !b) { members.push(mb); continue; }
      const ids = [mb.a], mids: number[] = [];
      for (let i = 1; i < n; i++) { const t = i / n; nodes.push({ id: nid, x: +(a.x + (b.x - a.x) * t).toFixed(6), y: +(a.y + (b.y - a.y) * t).toFixed(6), z: +(a.z + (b.z - a.z) * t).toFixed(6), r: /^..F..R$/.test(a.r) && /^..F..R$/.test(b.r) ? 'RRFFFR' : FREE }); ids.push(nid++); }
      ids.push(mb.b);
      for (let i = 0; i < n; i++) { const id = i === 0 ? mb.id : mid++; mids.push(id); members.push({ ...mb, id, a: ids[i], b: ids[i + 1], relA: i === 0 ? mb.relA : DASH, relB: i === n - 1 ? mb.relB : DASH }); }
      for (const l of m.distLoads.filter(x => x.member === mb.id)) for (let i = 0; i < n; i++) {
        const lo = Math.max(l.s, 100 * i / n), hi = Math.min(l.e, 100 * (i + 1) / n); if (hi - lo < 1e-9) continue;
        const w = (p: number) => l.w1 + (l.w2 - l.w1) * (p - l.s) / (l.e - l.s);
        dist.push({ ...l, member: mids[i], w1: w(lo), w2: w(hi), s: +(lo * n - 100 * i).toFixed(6), e: +(hi * n - 100 * i).toFixed(6) });
      }
      for (const l of m.pointLoads.filter(x => x.member === mb.id)) { const i = Math.min(n - 1, Math.floor(l.pos * n / 100)); point.push({ ...l, member: mids[i], pos: +(l.pos * n - 100 * i).toFixed(6) }); }
      for (const l of m.thermal.filter(x => x.member === mb.id)) mids.forEach(id => thermal.push({ ...l, member: id }));
    }
    const keep = <T extends { member: number }>(a: T[]) => a.filter(x => !which.has(x.member));
    return { ...out, nodes, members, distLoads: [...keep(m.distLoads), ...dist], pointLoads: [...keep(m.pointLoads), ...point], thermal: [...keep(m.thermal), ...thermal] };
  });
  /** Splits a member at its midpoint (loads stay with their part) and returns the number of the new node. */
  const splitMember = (id: number): number => { const nid = nextId(model.nodes); subdivide(2, new Set([id])); return nid; };
  const copyWith = (tf: (n: Node, k: number) => [number, number, number], count = 1) => setModel(m => {
    const mem = m.members.filter(x => sel.members.has(x.id) || (sel.nodes.has(x.a) && sel.nodes.has(x.b)));
    const ids = new Set([...sel.nodes, ...mem.flatMap(x => [x.a, x.b])]), nodes = m.nodes.slice(), members = m.members.slice();
    const dist = m.distLoads.slice(), point = m.pointLoads.slice(), nl = m.nodeLoads.slice();
    let nid = nextId(nodes), mid = nextId(members);
    for (let c = 1; c <= Math.max(1, Math.min(200, Math.round(count))); c++) {
      const map = new Map<number, number>();
      for (const n of m.nodes.filter(x => ids.has(x.id))) {
        const p = tf(n, c).map(v => +v.toFixed(6));
        const hit = nodes.find(x => Math.hypot(x.x - p[0], x.y - p[1], x.z - p[2]) < 1e-6);
        if (hit) map.set(n.id, hit.id); else { nodes.push({ ...n, id: nid, x: p[0], y: p[1], z: p[2] }); map.set(n.id, nid); nl.push(...m.nodeLoads.filter(l => l.node === n.id).map(l => ({ ...l, node: nid }))); nid++; }
      }
      for (const x of mem) {
        const a = map.get(x.a)!, b = map.get(x.b)!; if (members.some(y => (y.a === a && y.b === b) || (y.a === b && y.b === a))) continue;
        members.push({ ...x, id: mid, a, b });
        dist.push(...m.distLoads.filter(l => l.member === x.id).map(l => ({ ...l, member: mid }))); point.push(...m.pointLoads.filter(l => l.member === x.id).map(l => ({ ...l, member: mid }))); mid++;
      }
    }
    return { ...m, nodes, members, distLoads: dist, pointLoads: point, nodeLoads: nl };
  });
  /** Moves the selected nodes and the end nodes of the selected members. */
  const moveWith = (tf: (n: Node) => [number, number, number]) => setModel(m => {
    const ids = new Set([...sel.nodes, ...m.members.filter(x => sel.members.has(x.id)).flatMap(x => [x.a, x.b])]);
    return { ...m, nodes: m.nodes.map(n => { if (!ids.has(n.id)) return n; const [x, y, z] = tf(n).map(v => +v.toFixed(6)); return { ...n, x, y, z }; }) };
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement, typing = /INPUT|SELECT|TEXTAREA/.test(el.tagName);
      // Undo, redo and select all belong to the model unless text is being edited: a text box keeps its own undo and select all, but a datasheet cell nobody has typed in does not
      const textBox = (el.tagName === 'INPUT' && !/checkbox|radio|button|range/.test(el.type)) || el.tagName === 'TEXTAREA';
      const model_ = !textBox || (!!el.closest?.('.sheet') && el.value === el.dataset.v0), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z' && model_) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && k === 'y' && model_) { e.preventDefault(); redo(); }
      else if (mod && k === 'a' && model_) { e.preventDefault(); el.blur?.(); setSel({ nodes: new Set(model.nodes.map(n => n.id)), members: new Set(model.members.map(m => m.id)) }); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && tab !== 'results' && (sel.nodes.size || sel.members.size)) { e.preventDefault(); delSel(); }
      else if (e.key === 'Escape' && !typing) { setTool('select'); setSel(noSel()); setPickMove(null); setCtx(null); setPrompt(null); setTextPrompt(null); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [undo, redo, delSel, sel, tab, model.nodes, model.members]);
  // The value of a text box when it was entered or last committed, to tell whether it is being edited
  useEffect(() => {
    const mark = (e: Event) => { const t = e.target as HTMLInputElement; if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') t.dataset.v0 = t.value; };
    window.addEventListener('focusin', mark); window.addEventListener('change', mark);
    return () => { window.removeEventListener('focusin', mark); window.removeEventListener('change', mark); };
  }, []);
  useEffect(() => { if (tab === 'results') setTool('select'); }, [tab]);

  const applyLoad = (lc: number, sp: LoadSpec) => {
    setModel(m => {
      if (sp.type === 'node') return { ...m, nodeLoads: [...m.nodeLoads, ...[...sel.nodes].map(node => ({ lc, node, fx: sp.f[0], fy: sp.f[1], fz: sp.f[2], mx: sp.f[3], my: sp.f[4], mz: sp.f[5] }))] };
      if (sp.type === 'dist') return { ...m, distLoads: [...m.distLoads, ...[...sel.members].map(member => ({ lc, member, axes: sp.axes, dir: sp.dir, w1: sp.w1, w2: sp.w2, s: sp.s, e: sp.e }))] };
      return { ...m, pointLoads: [...m.pointLoads, ...[...sel.members].map(member => ({ lc, member, axes: sp.axes, dir: sp.dir, p: sp.p, pos: sp.pos }))] };
    });
    setCaseId(lc); setDialog(null);
  };
  useEffect(() => {
    if (!ctx && !prompt) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest?.('[data-ui]')) { setCtx(null); setPrompt(null); setTextPrompt(null); } };
    const gone = () => { setCtx(null); };
    window.addEventListener('pointerdown', away, true); window.addEventListener('wheel', gone, { passive: true });
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('wheel', gone); };
  }, [ctx, prompt]);
  const setNote = (kind: 'node' | 'member', ref: number, id: number | undefined, text: string) => { if (id === undefined && text.trim() !== '') setOpts(q => ({ ...q, notes: true })); setModel(m => {
    if (id !== undefined && text.trim() === '') return { ...m, notes: m.notes.filter(n => n.id !== id) };
    if (text.trim() === '') return m;
    return { ...m, notes: id !== undefined ? m.notes.map(n => (n.id === id ? { ...n, text } : n)) : [...m.notes, { id: nextId(m.notes), kind, ref, text, dx: 22, dy: -22 }] };
  }); };
  const menuOf = (): MenuState | null => {
    if (!ctx) return null;
    const edit = tab !== 'results', nodes = [...sel.nodes], mems = [...sel.members], at = { x: ctx.x, y: ctx.y };
    const run = (fn: () => void) => () => { setCtx(null); fn(); };
    const ask = (title: string, fields: PromptState['fields'], onSubmit: (v: number[]) => void) => { setCtx(null); setPrompt({ ...at, title, fields, onSubmit }); };
    const pick = (nn: Iterable<number>, mm: Iterable<number>) => setSel({ nodes: new Set(nn), members: new Set(mm) });
    const moved = new Set([...nodes, ...model.members.filter(x => sel.members.has(x.id)).flatMap(x => [x.a, x.b])]);
    const nodeMap2 = new Map(model.nodes.map(n => [n.id, n]));
    const baseNode = nodeMap2.get(ctx.node ?? model.members.find(x => x.id === ctx.member)?.a ?? -1);
    const startPick = (repeat: boolean) => {
      if (!baseNode) return;
      setCtx(null);
      setPickMove({ base: [baseNode.x, baseNode.y, baseNode.z], nodes: [...moved], repeat, apply: d => (repeat ? copyWith(n => [n.x + d[0], n.y + d[1], n.z + d[2]]) : moveWith(n => [n.x + d[0], n.y + d[1], n.z + d[2]])) });
    };
    const inc = (copyMode: boolean) => () => ask(copyMode ? 'Copy By Increment' : 'Move By Increment',
      [{ label: <>Δ<i>x</i> (m)</>, value: 0 }, { label: <>Δ<i>y</i> (m)</>, value: 0 }, { label: <>Δ<i>z</i> (m)</>, value: 0 }, ...(copyMode ? [{ label: 'Number of copies', value: 1 }] : [])],
      ([dx, dy, dz, n]) => (copyMode ? copyWith((q, k) => [q.x + dx * k, q.y + dy * k, q.z + dz * k], n) : moveWith(q => [q.x + dx, q.y + dy, q.z + dz])));
    const mirror = (copyMode: boolean): MenuItem[] => (['x', 'y', 'z'] as const).map((ax, i) => ({
      label: `Mirror About ${ax.toUpperCase()} Plane…`,
      onClick: () => ask(`Mirror About ${ax.toUpperCase()} =`, [{ label: <>{ax.toUpperCase()} (m)</>, value: 0 }], ([c]) => {
        const tf = (q: Node): [number, number, number] => [i === 0 ? 2 * c - q.x : q.x, i === 1 ? 2 * c - q.y : q.y, i === 2 ? 2 * c - q.z : q.z];
        if (copyMode) copyWith(q => tf(q)); else moveWith(tf);
      }),
    }));
    const moveCopy: MenuItem[] = [
      { label: 'Move', sub: [{ label: 'To a Point', onClick: () => startPick(false) }, { label: 'By Increment…', onClick: inc(false) }, ...mirror(false)] },
      { label: 'Copy', sub: [{ label: 'To a Point', onClick: () => startPick(true) }, { label: 'By Increment…', onClick: inc(true) }, ...mirror(true)] },
    ];
    const noteItems = (kind: 'node' | 'member', ref: number | null): MenuItem[] => {
      if (ref === null) return [];
      const ex = model.notes.find(n => n.kind === kind && n.ref === ref), edit_ = () => { setCtx(null); setTextPrompt({ ...at, title: ex ? 'Edit Note' : 'Add Note', text: ex?.text ?? '', onSubmit: t => setNote(kind, ref, ex?.id, t) }); };
      return [{ label: ex ? 'Edit Note…' : 'Add Note…', onClick: edit_ }, ...(ex ? [{ label: 'Delete Note', onClick: run(() => setNote(kind, ref, ex.id, '')) }] : []), 'sep' as const];
    };
    const items: MenuItem[] = []; let title = 'View';
    const word = (n: number, w: string, only: number | undefined) => (n === 1 ? `${w} ${only}` : `${n} ${w}s`);
    if (ctx.note != null) {
      const nt = model.notes.find(n => n.id === ctx.note);
      title = 'Note';
      if (nt) items.push({ label: 'Edit Note…', onClick: () => { setCtx(null); setTextPrompt({ ...at, title: 'Edit Note', text: nt.text, onSubmit: t => setNote(nt.kind, nt.ref, nt.id, t) }); } }, { label: 'Delete Note', danger: true, onClick: run(() => setNote(nt.kind, nt.ref, nt.id, '')) });
    } else if (ctx.node !== null && nodes.length) {
      title = word(nodes.length, 'Node', nodes[0]);
      items.push(...noteItems('node', ctx.node));
      if (edit) items.push(
        { label: 'Apply Load…', onClick: run(() => { setLoadKind('node'); setDialog('load'); }) },
        { label: 'Restraint', sub: RESTRAINTS.map(([c, l]) => ({ label: `${l} (${c})`, onClick: run(() => patchNodes({ r: c })) })) }, 'sep', ...moveCopy, 'sep');
      items.push({ label: 'Select Connected Members', onClick: run(() => pick(sel.nodes, [...sel.members, ...model.members.filter(m => sel.nodes.has(m.a) || sel.nodes.has(m.b)).map(m => m.id)])) });
      if (edit) items.push('sep', { label: nodes.length > 1 ? 'Delete Nodes' : 'Delete Node', danger: true, onClick: run(delSel) });
    } else if (ctx.member !== null && mems.length) {
      title = word(mems.length, 'Member', mems[0]);
      items.push(...noteItems('member', ctx.member));
      const mem0 = model.members.find(m => m.id === ctx.member), sec0 = mem0?.sec;
      const selMembers = model.members.filter(m => sel.members.has(m.id));
      // Releases are set by end number: end 1 is the first node of a member and end 2 the second
      const relMenu = (label: string, isOn: (m: Member, c: string) => boolean, apply: (c: string) => void): MenuItem => ({ label, sub: RELEASES.map(([c, l]) => ({ label: `${l} (${c})`, checked: selMembers.length > 0 && selMembers.every(m => isOn(m, c)), onClick: run(() => apply(c)) })) });
      const endRel = (k: 1 | 2) => relMenu(`Release at End ${k}`, (m, c) => (k === 1 ? m.relA : m.relB) === c, c => patchMembers(k === 1 ? { relA: c } : { relB: c }));
      const bothRel = relMenu('Release at Both Ends', (m, c) => m.relA === c && m.relB === c, c => patchMembers({ relA: c, relB: c }));
      const clickedEnd: 1 | 2 | null = mem0 && ctx.endNode !== null ? (ctx.endNode === mem0.a ? 1 : 2) : null;
      const endItems: MenuItem[] = clickedEnd ? [endRel(clickedEnd), bothRel, endRel(clickedEnd === 1 ? 2 : 1)] : [bothRel, endRel(1), endRel(2)];
      if (edit) items.push(
        { label: 'Apply Load…', onClick: run(() => { setLoadKind('member'); setDialog('load'); }) },
        { label: 'Section', sub: [...model.sections.map(x => ({ label: x.name, checked: mems.every(id => model.members.find(m => m.id === id)?.sec === x.id), onClick: run(() => patchMembers({ sec: x.id })) })), 'sep' as const, { label: 'Add Section…', onClick: run(() => { setAssignOnAdd(true); setReplaceSec(null); setDialog('section'); }) }] },
        ...endItems,
        { label: 'Member Type', sub: ([['N', 'Normal'], ['T', 'Tension Only'], ['C', 'Compression Only']] as const).map(([c, l]) => ({ label: l, onClick: run(() => patchMembers({ type: c })) })) },
        { label: 'Subdivide', sub: [2, 3, 4, 5, 6, 8, 10].map(k => ({ label: `Into ${k} Parts`, onClick: run(() => subdivide(k)) })) }, 'sep', ...moveCopy, 'sep');
      items.push({ label: 'Select Same Section', onClick: run(() => pick(sel.nodes, model.members.filter(m => m.sec === sec0).map(m => m.id))) },
        { label: 'Select Connected Nodes', onClick: run(() => pick([...sel.nodes, ...model.members.filter(m => sel.members.has(m.id)).flatMap(m => [m.a, m.b])], sel.members)) });
      if (edit) items.push('sep', { label: mems.length > 1 ? 'Delete Members' : 'Delete Member', danger: true, onClick: run(delSel) });
    } else {
      items.push({ label: 'Select All', onClick: run(() => pick(model.nodes.map(n => n.id), model.members.map(m => m.id))) },
        { label: 'Clear Selection', disabled: !nodes.length && !mems.length, onClick: run(() => setSel(noSel())) }, 'sep', { label: 'Zoom to Fit', onClick: run(() => viewer.current?.fit()) });
    }
    return { x: ctx.x, y: ctx.y, title, items };
  };

  const save = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(model, null, 1)], { type: 'application/json' }));
    a.download = `${(model.title || 'model').replace(/[^\w-]+/g, '_')}.cosmicwind.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const open = async (f: File | undefined) => {
    if (!f) return;
    try { const m = normalise(JSON.parse(await f.text())); if (!Array.isArray(m.nodes)) throw new Error(); setModel(() => m); setFitRev(r => r + 1); setSel(noSel()); }
    catch { alert('The file is not a CosmicWind model.'); }
  };

  // ---- Datasheet columns
  const secOpt = opt(model.sections), secNo = model.sections.map(r => ({ value: String(r.id), label: String(r.id) })), matOpt = opt(model.materials), lcOpt = opt(model.loadCases);
  const idSel = (key: string, label: string, options: { value: string; label: string }[], w = 90): Col<any> => ({ key, label, type: 'select', options, w, set: (r: object, v: string | number) => ({ ...r, [key]: Number(v) }) }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const nodeSpec: DofSpec<Node> = {
    title: n => `Node ${n.id}: Restraint`, names: ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ'], units: ['kN/m', 'kN/m', 'kN/m', 'kNm/rad', 'kNm/rad', 'kNm/rad'], spring: [true, true, true, true, true, true],
    presets: RESTRAINTS, dflt: 'RRRRRR', code: n => n.r, stiffness: n => n.k ?? [],
    apply: (n, c, k) => ({ ...n, r: c === 'RRRRRR' ? DASH : c, k: c.includes('S') ? k : undefined }),
  };
  const memSpec = (end: 'A' | 'B'): DofSpec<Member> => ({
    title: m => `Member ${m.id}: Release at End ${end === 'A' ? 1 : 2}`, names: ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'], units: ['kN/m', '', '', 'kNm/rad', 'kNm/rad', 'kNm/rad'], spring: [true, false, false, true, true, true],
    presets: RELEASES, dflt: 'FFFFFF', code: m => (end === 'A' ? m.relA : m.relB), stiffness: m => (end === 'A' ? m.kA : m.kB) ?? [],
    apply: (m, c, k) => { const rel = c === 'FFFFFF' ? DASH : c, ks = c.includes('S') ? k : undefined; return end === 'A' ? { ...m, relA: rel, kA: ks } : { ...m, relB: rel, kB: ks }; },
  });
  /** A release code typed or pasted into a cell: springs are not allowed on the shear forces. */
  const relCode = (v: string | number, old: string) => { const c = code(v, old); return c !== old && (c[1] === 'S' || c[2] === 'S') ? old : c; };
  const nodeCols: Col<Node>[] = [{ key: 'x', label: 'X (m)' }, { key: 'y', label: 'Y (m)' }, { key: 'z', label: 'Z (m)' },
    { key: 'r', label: 'Restraint', type: 'dof', dof: nodeSpec, w: 96, title: 'F fixed, R released or S spring, for DX DY DZ RX RY RZ', set: (r, v) => ({ ...r, r: code(v, r.r) }) }];
  const memCols: Col<Member>[] = [{ key: 'a', label: 'End 1', title: 'Node at end 1 of the member', w: 48 }, { key: 'b', label: 'End 2', title: 'Node at end 2 of the member', w: 48 }, idSel('sec', 'Section No.', secNo, 70), idSel('mat', 'Material', matOpt, 90),
    { key: 'angle', label: 'Angle (°)', w: 50 }, { key: 'type', label: 'Type', type: 'select', w: 96, options: [{ value: 'N', label: 'Normal' }, { value: 'T', label: 'Tension Only' }, { value: 'C', label: 'Compr. Only' }] },
    { key: 'relA', label: 'Release 1', type: 'dof', dof: memSpec('A'), w: 96, title: 'F fixed, R released or S spring (not for the shears), for the local x y z forces and moments', set: (r, v) => ({ ...r, relA: relCode(v, r.relA) }) },
    { key: 'relB', label: 'Release 2', type: 'dof', dof: memSpec('B'), w: 96, title: 'F fixed, R released or S spring (not for the shears), for the local x y z forces and moments', set: (r, v) => ({ ...r, relB: relCode(v, r.relB) }) }];
  const secCols: Col<Section>[] = [{ key: 'name', label: 'Section Type', type: 'text', w: 150 }, { key: 'A', label: <><i>A</i> (mm²)</>, w: 60 }, { key: 'Iz', label: <><i>I</i><sub>z</sub> (mm⁴)</>, w: 76 }, { key: 'Iy', label: <><i>I</i><sub>y</sub> (mm⁴)</>, w: 76 }, { key: 'J', label: <><i>J</i> (mm⁴)</>, w: 70 }];
  const matCols: Col<Material>[] = [{ key: 'name', label: 'Name', type: 'text', w: 110 }, { key: 'E', label: <><i>E</i> (MPa)</>, w: 60 }, { key: 'G', label: <><i>G</i> (MPa)</>, w: 60 }, { key: 'rho', label: 'Density (kg/m³)', w: 70 }, { key: 'alpha', label: <><i>α</i> (/°C)</>, w: 70 }];
  const massCols: Col<NodeMass>[] = [{ key: 'node', label: 'Node' }, { key: 'm', label: 'Mass (t)' }];
  const lcCols: Col<LoadCase>[] = [{ key: 'name', label: 'Name', type: 'text', w: 130 }, { key: 'gx', label: 'Gravity X', title: 'Gravity load as a multiplier of g in global X' }, { key: 'gy', label: 'Gravity Y', title: 'Gravity load as a multiplier of g in global Y (−1 is downward)' }, { key: 'gz', label: 'Gravity Z', title: 'Gravity load as a multiplier of g in global Z' }];
  const comboCols: Col<Combo>[] = [{ key: 'name', label: 'Name', type: 'text', w: 150 }, ...model.loadCases.map((c): Col<Combo> => ({ key: `f${c.id}`, label: `× Case ${c.id}`, title: c.name, w: 58, get: r => r.f[c.id] ?? 0, set: (r, v) => ({ ...r, f: { ...r.f, [c.id]: Number(v) } }) }))];
  const lcCol = idSel('lc', 'Case', lcOpt, 112);
  const axesCol = { key: 'axes', label: 'Axes', type: 'select' as const, w: 66, options: [{ value: 'G', label: 'Global' }, { value: 'L', label: 'Local' }] };
  const nlCols: Col<NodeLoad>[] = [lcCol, { key: 'node', label: 'Node', w: 44 }, ...(['fx', 'fy', 'fz'] as const).map(k => ({ key: k, label: `${k.toUpperCase()} (kN)`, w: 54 })), ...(['mx', 'my', 'mz'] as const).map(k => ({ key: k, label: `${k.toUpperCase()} (kNm)`, w: 58 }))];
  const dlCols: Col<DistLoad>[] = [lcCol, { key: 'member', label: 'Member', w: 50 }, axesCol, { key: 'dir', label: 'Dir.', type: 'select', w: 44, options: ['X', 'Y', 'Z'].map(v => ({ value: v, label: v })) },
    { key: 'w1', label: <><i>w</i><sub>1</sub> (kN/m)</>, w: 60 }, { key: 'w2', label: <><i>w</i><sub>2</sub> (kN/m)</>, w: 60 }, { key: 's', label: 'Start (%)', w: 52 }, { key: 'e', label: 'End (%)', w: 52 }];
  const plCols: Col<PointLoad>[] = [lcCol, { key: 'member', label: 'Member', w: 50 }, axesCol, { key: 'dir', label: 'Dir.', type: 'select', w: 80, options: [...['X', 'Y', 'Z'].map(v => ({ value: v, label: `Force ${v}` })), ...['MX', 'MY', 'MZ'].map(v => ({ value: v, label: `Moment ${v[1]}` }))] },
    { key: 'p', label: 'Load (kN, kNm)', w: 80 }, { key: 'pos', label: 'Position (%)', w: 66 }];
  const stCols: Col<Settlement>[] = [lcCol, { key: 'node', label: 'Node', w: 44 }, { key: 'dx', label: 'DX (mm)' }, { key: 'dy', label: 'DY (mm)' }, { key: 'dz', label: 'DZ (mm)' }];
  const thCols: Col<ThermalLoad>[] = [lcCol, { key: 'member', label: 'Member' }, { key: 'dT', label: 'Temperature Change (°C)', w: 130 }];

  const firstNode = [...sel.nodes][0] ?? model.nodes[0]?.id ?? 1, firstMem = [...sel.members][0] ?? model.members[0]?.id ?? 1;
  const pickN = (r: { id: number }, add: boolean) => setSel(s => { const n = new Set(add ? s.nodes : []); if (add && s.nodes.has(r.id)) n.delete(r.id); else n.add(r.id); return { nodes: n, members: add ? s.members : new Set() }; });
  const pickM = (r: { id: number }, add: boolean) => setSel(s => { const n = new Set(add ? s.members : []); if (add && s.members.has(r.id)) n.delete(r.id); else n.add(r.id); return { members: n, nodes: add ? s.nodes : new Set() }; });
  const idLabel = (r: { id: number }) => r.id;
  const used = (k: 'sec' | 'mat', id: number) => model.members.some(m => m[k] === id);

  const SUBS = {
    structure: [['nodes', 'Nodes'], ['members', 'Members'], ['sections', 'Sections'], ['materials', 'Materials'], ['masses', 'Masses']],
    loads: [['cases', 'Cases'], ['combos', 'Combinations'], ['node', 'Node Loads'], ['dist', 'Distributed'], ['point', 'Point'], ['settle', 'Settlements'], ['thermal', 'Temperature']],
  } as const;
  const st = sub.structure, ld = sub.loads;
  const nSel = sel.nodes.size, mSel = sel.members.size;

  /** The calculated buckling or vibration modes, one row each; a click shows or hides the mode shape on the canvas. */
  const modeTable = (kind: 'buckling' | 'modal', values: number[] | undefined, head: string) => {
    if (!values?.length) return (kind === 'buckling' ? model.settings.bucklingModes : model.settings.modalModes) > 0
      ? <div className="readout"><span>Result</span><span className="readout-value">None Found</span></div> : null;
    return <table className="rtable">
      <thead><tr><th>Mode</th><th>{head}</th>{kind === 'modal' && <th>Period (s)</th>}<th>Shape</th></tr></thead>
      <tbody>{values.map((v, i) => { const on = modeIx?.kind === kind && modeIx.i === i; return <tr key={i} className={`cursor-pointer ${on ? '!bg-blue-50' : ''}`} onClick={() => setModeIx(on ? null : { kind, i })}>
        <td>{i + 1}</td><td>{v.toFixed(3)}</td>{kind === 'modal' && <td>{(1 / v).toFixed(4)}</td>}<td>{on ? 'Shown' : 'Show'}</td></tr>; })}</tbody>
    </table>;
  };

  return (
    <div className="fill-window app-wide min-h-screen bg-slate-100 lg:h-screen lg:overflow-hidden flex flex-col">
      <AppHeader name="CosmicWind" logoSrc="/favicon.svg" onAbout={() => setDialog('about')} onReport={() => setDialog('report')}
        tabs={[{ key: 'structure', label: 'Structure', icon: <Box className="w-3.5 h-3.5" /> }, { key: 'loads', label: 'Loads', icon: <Weight className="w-3.5 h-3.5" /> }, { key: 'results', label: 'Analysis and Results', icon: <LineChart className="w-3.5 h-3.5" /> }]}
        activeTab={tab} onTab={setTab}
        actions={<div className="flex items-center gap-1">
          <button className="btn !px-2" title="Undo (Ctrl+Z)" disabled={!hist.past.length} onClick={undo}><Undo2 className="w-3.5 h-3.5" /></button>
          <button className="btn !px-2" title="Redo (Ctrl+Y)" disabled={!hist.future.length} onClick={redo}><Redo2 className="w-3.5 h-3.5" /></button>
          <button className="btn" title="New model from a template" onClick={() => setDialog('new')}><FilePlus className="w-3.5 h-3.5" /><span className="hidden md:inline">New</span></button>
          <button className="btn" title="Open a model file" onClick={() => fileRef.current?.click()}><FolderOpen className="w-3.5 h-3.5" /><span className="hidden md:inline">Open</span></button>
          <button className="btn" title="Save the model to a file" onClick={save}><Save className="w-3.5 h-3.5" /><span className="hidden md:inline">Save</span></button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { open(e.target.files?.[0]); e.target.value = ''; }} />
        </div>} />
      <main className="flex-1 flex flex-col lg:min-h-0 p-3 w-full">
        <div className="tab-grid lg:!grid-cols-[minmax(600px,1fr)_minmax(0,2fr)]">
          <div className="input-column scroll-thin">
            {tab === 'structure' && tool === 'member' && (() => {
              const lastM = model.members[model.members.length - 1];
              const secV = model.sections.some(s => s.id === drawSec) ? drawSec : lastM?.sec ?? model.sections[0]?.id, matV = model.materials.some(s => s.id === drawMat) ? drawMat : lastM?.mat ?? model.materials[0]?.id;
              const presets = MATERIAL_PRESETS.map((p, i) => ({ p, i })).filter(({ p }) => !model.materials.some(x => x.name === p.name));
              return <div className="panel">
                <h2 className="panel-title">New Members</h2>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField label="Section" value={secV === undefined ? '' : String(secV)} onChange={v => v === '+' ? (setAssignOnAdd(false), setAssignDraw(true), setReplaceSec(null), setDialog('section')) : setDrawSec(Number(v))} options={[...secOpt, { value: '+', label: 'Add Section…' }]} />
                  <SelectField label="Material" value={matV === undefined ? '' : String(matV)} onChange={v => {
                    if (v.startsWith('p')) { const p = MATERIAL_PRESETS[Number(v.slice(1))], id = nextId(model.materials); setModel(m => ({ ...m, materials: [...m.materials, { ...p, id }] })); setDrawMat(id); } else setDrawMat(Number(v));
                  }} options={[...matOpt, ...presets.map(({ p, i }) => ({ value: `p${i}`, label: `Add ${p.name}` }))]} />
                </div>
              </div>;
            })()}
            {tab !== 'results' && <div className="panel">
              <div className="flex gap-1 flex-wrap">{SUBS[tab].map(([k, l]) => <button key={k} className={`subtab ${sub[tab] === k ? 'subtab-active' : ''}`} onClick={() => setSub({ ...sub, [tab]: k })}>{l}</button>)}</div>
              {tab === 'structure' && <>
                {st === 'nodes' && <Sheet rows={model.nodes} cols={nodeCols} onChange={set('nodes')} rowLabel={idLabel} selected={r => sel.nodes.has(r.id)} onSelect={pickN}
                  newRow={() => { const l = model.nodes[model.nodes.length - 1]; return { id: nextId(model.nodes), x: l?.x ?? 0, y: l?.y ?? 0, z: l?.z ?? 0, r: FREE }; }}
                  onDelete={r => setModel(m => deleteNodes(m, new Set([r.id])))} />}
                {st === 'members' && <Sheet rows={model.members} cols={memCols} onChange={v => setModel(m => ({ ...ensureSection(m), members: v }))} rowLabel={idLabel} selected={r => sel.members.has(r.id)} onSelect={pickM}
                  newRow={() => { const l = model.members[model.members.length - 1]; return { id: nextId(model.members), a: l?.b ?? model.nodes[0]?.id ?? 1, b: model.nodes[model.nodes.length - 1]?.id ?? 2, sec: l?.sec ?? model.sections[0]?.id ?? 1, mat: l?.mat ?? model.materials[0]?.id ?? 1, angle: 0, type: 'N' as const, relA: DASH, relB: DASH }; }}
                  onDelete={r => setModel(m => deleteMembersAndFreeNodes(m, new Set([r.id])))} />}
                {st === 'sections' && <>
                  <Sheet rows={model.sections} cols={secCols} onChange={set('sections')} rowLabel={idLabel} selected={r => r.id === secSel} onSelect={r => setSecSel(r.id)} newRow={() => ({ id: nextId(model.sections), name: `Section ${nextId(model.sections)}`, A: 5000, Iy: 1e7, Iz: 5e7, J: 1e5 })}
                    onDelete={r => (used('sec', r.id) ? alert(`Section ${r.id} is used by members.`) : set('sections')(model.sections.filter(s => s.id !== r.id)))} />
                  <button className="btn-primary" onClick={() => { setAssignOnAdd(false); setReplaceSec(null); setDialog('section'); }}><Shapes className="w-3.5 h-3.5" /> Add From Library or Shape</button>
                  <button className="btn" disabled={secSel === null || !model.sections.some(x => x.id === secSel)} title="Select a section row, then choose a new type for its number; members keep the number" onClick={() => { setAssignOnAdd(false); setReplaceSec(secSel); setDialog('section'); }}><Shapes className="w-3.5 h-3.5" /> {secSel !== null && model.sections.some(x => x.id === secSel) ? `Change Type of Section ${secSel}` : 'Change Type of Selected Section'}</button>
                </>}
                {st === 'materials' && <>
                  <Sheet rows={model.materials} cols={matCols} onChange={set('materials')} rowLabel={idLabel}
                    onDelete={r => (used('mat', r.id) ? alert(`Material ${r.id} is used by members.`) : set('materials')(model.materials.filter(s => s.id !== r.id)))} />
                  <select className="control" value="" onChange={e => { const p = MATERIAL_PRESETS[Number(e.target.value)]; if (p) set('materials')([...model.materials, { ...p, id: nextId(model.materials) }]); }}>
                    <option value="">Add Material…</option>{MATERIAL_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select>
                </>}
                {st === 'masses' && <Sheet rows={model.masses} cols={massCols} onChange={set('masses')} newRow={() => ({ node: firstNode, m: 1 })} empty="No node masses (used for natural frequencies)" />}
              </>}
              {tab === 'loads' && <>
                {ld === 'cases' && <Sheet rows={model.loadCases} cols={lcCols} onChange={set('loadCases')} rowLabel={idLabel} newRow={() => ({ id: nextId(cases), name: 'Load Case', gx: 0, gy: 0, gz: 0 })}
                  onDelete={r => setModel(m => {
                    const f = <T extends { lc: number }>(a: T[]) => a.filter(x => x.lc !== r.id);
                    return { ...m, loadCases: m.loadCases.filter(c => c.id !== r.id), nodeLoads: f(m.nodeLoads), distLoads: f(m.distLoads), pointLoads: f(m.pointLoads), settlements: f(m.settlements), thermal: f(m.thermal),
                      combos: m.combos.map(c => { const { [r.id]: _, ...rest } = c.f; return { ...c, f: rest }; }) };
                  })} />}
                {ld === 'combos' && <Sheet rows={model.combos} cols={comboCols} onChange={set('combos')} rowLabel={idLabel} newRow={() => ({ id: Math.max(nextId(cases), 10), name: 'Combination', f: {} })} empty="No combinations" />}
                {ld === 'node' && <Sheet rows={model.nodeLoads} cols={nlCols} onChange={set('nodeLoads')} newRow={() => ({ lc: lcOnly, node: firstNode, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 })} empty="No node loads" />}
                {ld === 'dist' && <Sheet rows={model.distLoads} cols={dlCols} onChange={set('distLoads')} newRow={() => ({ lc: lcOnly, member: firstMem, axes: 'G' as const, dir: 'Y' as const, w1: -5, w2: -5, s: 0, e: 100 })} empty="No distributed loads" />}
                {ld === 'point' && <Sheet rows={model.pointLoads} cols={plCols} onChange={set('pointLoads')} newRow={() => ({ lc: lcOnly, member: firstMem, axes: 'G' as const, dir: 'Y' as const, p: -10, pos: 50 })} empty="No point loads" />}
                {ld === 'settle' && <Sheet rows={model.settlements} cols={stCols} onChange={set('settlements')} newRow={() => ({ lc: lcOnly, node: firstNode, dx: 0, dy: -10, dz: 0 })} empty="No support settlements" />}
                {ld === 'thermal' && <Sheet rows={model.thermal} cols={thCols} onChange={set('thermal')} newRow={() => ({ lc: lcOnly, member: firstMem, dT: 20 })} empty="No temperature loads" />}
              </>}
            </div>}
            {tab === 'results' && analysis && (analysis.errors.length > 0 || analysis.warnings.length > 0 || !!res?.error) && <div className="panel">
              {analysis.errors.length > 0 && <Banner kind="error" title="The model could not be analysed" items={analysis.errors} />}
              {res?.error && <Banner kind="error" title="This case could not be solved" items={[res.error]} />}
              {analysis.warnings.length > 0 && <Banner kind="warning" title="Warnings" items={analysis.warnings} />}
            </div>}
            {tab === 'results' && <>
              <div className="panel">
                <h2 className="panel-title">Analysis</h2>
                <Check checked={model.settings.nonlinear} onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, nonlinear: v } }))} title="Iterates with the geometric stiffness from the member axial forces">Second-Order (P-Δ) Analysis</Check>
                {analysis && (analysis.errors.length ? <StatusChip kind="fail">Not Solved</StatusChip> : res?.error ? <StatusChip kind="fail">Case Not Solved</StatusChip>
                  : <StatusChip kind="pass">{model.settings.nonlinear ? 'Second-Order' : 'Linear'} Analysis Solved in {analysis.ms < 10 ? analysis.ms.toFixed(1) : analysis.ms.toFixed(0)} ms</StatusChip>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
              <div className="panel">
                <h2 className="panel-title">Deflections</h2>
                <div className="space-y-2.5">
                  <div>
                    <span className="label">Global Deflection at Nodes</span>
                    <Segmented value={opts.defLabels} onChange={v => o('defLabels')(v)} options={[{ value: 'none', label: 'None' }, { value: 'X', label: 'X' }, { value: 'Y', label: 'Y' }, { value: 'Z', label: 'Z' }, { value: 'XYZ', label: 'XYZ' }]} />
                  </div>
                  <Check checked={opts.deflected} onChange={o('deflected')}>Deflected Shape</Check>
                  <NumberField label="Deflection Scale" value={opts.defScale} min={0.1} max={20} step={0.25} onChange={o('defScale')} />
                </div>
              </div>
              <div className="panel">
                <h2 className="panel-title">Diagrams</h2>
                <div className="grid grid-cols-2 gap-x-3 items-start">
                  <div key={DIAGRAM_GROUPS[0].title}>
                    <h3 className="label">{DIAGRAM_GROUPS[0].title}</h3>
                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                      {DIAGRAM_GROUPS[0].items.map(([key, text]) => { const d = DIAGRAMS.find(x => x.key === key)!; return <Check key={key} checked={opts.diagrams[key]} onChange={v => o('diagrams')({ ...opts.diagrams, [key]: v })} title={d.label}><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: d.colour }} />{symbol(text)}</Check>; })}
                    </div>
                  </div>
                  <div key={DIAGRAM_GROUPS[1].title}>
                    <h3 className="label">{DIAGRAM_GROUPS[1].title}</h3>
                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                      {DIAGRAM_GROUPS[1].items.map(([key, text]) => { const d = DIAGRAMS.find(x => x.key === key)!; return <Check key={key} checked={opts.diagrams[key]} onChange={v => o('diagrams')({ ...opts.diagrams, [key]: v })} title={d.label}><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: d.colour }} />{symbol(text)}</Check>; })}
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div key={DIAGRAM_GROUPS[2].title}>
                    <h3 className="label">{DIAGRAM_GROUPS[2].title}</h3>
                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                      {DIAGRAM_GROUPS[2].items.map(([key, text]) => { const d = DIAGRAMS.find(x => x.key === key)!; return <Check key={key} checked={opts.diagrams[key]} onChange={v => o('diagrams')({ ...opts.diagrams, [key]: v })} title={d.label}><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: d.colour }} />{symbol(text)}</Check>; })}
                    </div>
                  </div>
                  <div key={DIAGRAM_GROUPS[3].title}>
                    <h3 className="label">{DIAGRAM_GROUPS[3].title}</h3>
                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                      {DIAGRAM_GROUPS[3].items.map(([key, text]) => { const d = DIAGRAMS.find(x => x.key === key)!; return <Check key={key} checked={opts.diagrams[key]} onChange={v => o('diagrams')({ ...opts.diagrams, [key]: v })} title={d.label}><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: d.colour }} />{symbol(text)}</Check>; })}
                    </div>
                  </div>
                </div>
                <NumberField label="Diagram Scale" value={opts.scale} min={0.1} max={20} step={0.25} onChange={o('scale')} />
              </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
              <div className="panel">
                <h2 className="panel-title">Reactions</h2>
                <Check checked={opts.reactions} onChange={o('reactions')}>Show Reactions</Check>
              </div>
              <div className="panel">
                <h2 className="panel-title">Stresses</h2>
                <SelectField hint="Colours the rendered members; switches to the rendered view" label="Normal Stress" value={opts.stress} onChange={v => setOpts(q => ({ ...q, stress: v as StressKey, solid: v !== 'none' ? true : q.solid }))} options={STRESSES.map(t => ({ value: t.key, label: t.label }))} />
              </div>
              </div>
              <div className="panel">
                <h2 className="panel-title">Buckling</h2>
                <NumberField label="Modes" value={model.settings.bucklingModes} min={0} max={20} onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, bucklingModes: Math.round(v) } }))} />
                {modeTable('buckling', okRes?.buckling?.values, 'Load Factor')}
              </div>
              <div className="panel">
                <h2 className="panel-title">Vibration</h2>
                <NumberField label="Modes" value={model.settings.modalModes} min={0} max={30} onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, modalModes: Math.round(v) } }))} />
                {modeTable('modal', analysis?.modal?.values, 'Frequency (Hz)')}
              </div>
            </>}
          </div>

          <div className="results-column">
            <div ref={cvRef} className="relative bg-slate-50 rounded-lg border border-slate-200 shadow-2xs overflow-hidden h-[520px] lg:h-auto lg:flex-1 lg:min-h-[240px]">
              <Viewer ref={viewer} notes={model.notes} onNoteMove={(id, dx, dy) => setModel(m => ({ ...m, notes: m.notes.map(n => (n.id === id ? { ...n, dx, dy } : n)) }))} onNoteEdit={(id, x, y) => { const nt = model.notes.find(n => n.id === id); if (nt) setTextPrompt({ x, y, title: 'Edit Note', text: nt.text, onSubmit: t => setNote(nt.kind, nt.ref, nt.id, t) }); }} fitRev={fitRev} onSplitMember={splitMember} pick={pickMove} onPickEnd={() => setPickMove(null)} model={model} opts={opts} tool={tool} sel={sel} onSelect={setSel} loadCases={drawLoads} result={tab === 'results' ? okRes : null} mode={tab === 'results' ? modeShape : null} animateMode={modeIx?.kind === 'modal'} onAddNode={addNode} onAddMember={addMember}
                onContext={c => { setCtx(c); if (c.node !== null && !sel.nodes.has(c.node)) setSel({ nodes: new Set([c.node]), members: new Set() }); else if (c.node === null && c.member !== null && !sel.members.has(c.member)) setSel({ nodes: new Set(), members: new Set([c.member]) }); }} />
              {ctx && menuOf() && <ContextMenu menu={menuOf()!} W={cvSize.width} H={cvSize.height} onClose={() => setCtx(null)} />}
              {textPrompt && <TextPromptBox prompt={textPrompt} W={cvSize.width} H={cvSize.height} onClose={() => setTextPrompt(null)} />}
              {prompt && <PromptBox prompt={prompt} W={cvSize.width} H={cvSize.height} onClose={() => setPrompt(null)} />}
              {tab !== 'results' && <div className="absolute top-2 left-2 toolbar w-[104px]">
                  <button className={`tool-btn ${tool === 'select' ? 'tool-btn-active' : ''}`} onClick={() => setTool('select')}><MousePointer2 className="w-3.5 h-3.5" />Select</button>
                  <button className={`tool-btn ${tool === 'node' ? 'tool-btn-active' : ''}`} title="Click to add nodes on the XY plane (Z = 0); nodes and member midpoints snap" onClick={() => setTool('node')}><Dot className="w-3.5 h-3.5" />Node</button>
                  <button className={`tool-btn ${tool === 'member' ? 'tool-btn-active' : ''}`} title="Click node to node to add members; Escape ends the chain" onClick={() => setTool('member')}><Spline className="w-3.5 h-3.5" />Member</button>
                  <button className={`tool-btn ${tool === 'measure' ? 'tool-btn-active' : ''}`} title="Click two points to measure the distance; nodes snap, Esc clears" onClick={() => setTool('measure')}><Ruler className="w-3.5 h-3.5" />Measure</button>
                  <button className="tool-btn" disabled={!nSel && !mSel} onClick={delSel}><Trash2 className="w-3.5 h-3.5" />Delete</button>
              </div>}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
              <label className="flex items-center gap-2 bg-white/95 border border-slate-200 rounded-md shadow-2xs pl-2.5 pr-1 py-1">
                <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">Load Case</span>
                <select className="control !w-auto !h-7 !py-0" value={String(cur?.id ?? '')} onChange={e => { setCaseId(Number(e.target.value)); setModeIx(m => (m?.kind === 'buckling' ? null : m)); }}>
                  {cases.map(c => <option key={c.id} value={c.id}>{`${c.id}: ${c.name}`}</option>)}
                </select>
              </label>
              {opts.loads && !(tab === 'results' && modeShape) && gravity.some(v => v !== 0) && <div className="bg-white/95 border border-slate-200 rounded-md shadow-2xs px-2.5 py-0.5 text-[11px] font-medium text-red-600 whitespace-nowrap">
                Gravity: {(['X', 'Y', 'Z'] as const).map((a, i) => gravity[i] !== 0 ? `${a} ${String(+gravity[i].toFixed(3)).replace('-', '−')} g` : '').filter(Boolean).join(', ')}
              </div>}
              </div>
              <div className="absolute top-2 right-2">
                <div className="toolbar w-[112px]">
                <ToolFlyout icon={<Eye className="w-3.5 h-3.5" />} label="View">
                  <button className="tool-btn" onClick={() => viewer.current?.fit()}><Maximize className="w-3.5 h-3.5" />Fit</button>
                  {(['iso', 'front', 'top', 'side'] as const).map(v => <button key={v} className="tool-btn" onClick={() => viewer.current?.view(v)}><Box className="w-3.5 h-3.5" />{{ iso: '3D', front: 'Front', top: 'Top', side: 'Side' }[v]}</button>)}
                </ToolFlyout>
                <div className="tool-sep" />
                <button className={`tool-btn ${!opts.solid ? 'tool-btn-active' : ''}`} title="Wireframe view" onClick={() => o('solid')(false)}><Waypoints className="w-3.5 h-3.5" />Wireframe</button>
                <button className={`tool-btn ${opts.solid ? 'tool-btn-active' : ''}`} title="Rendered 3D view of the member cross sections" onClick={() => o('solid')(true)}><Cuboid className="w-3.5 h-3.5" />Rendered</button>
                <div className="tool-sep" />
                <button className={`tool-btn ${opts.nodeNo ? '!text-blue-700' : ''}`} title="Node numbers" onClick={() => o('nodeNo')(!opts.nodeNo)}><Hash className="w-3.5 h-3.5" />Nodes</button>
                <button className={`tool-btn ${opts.memberNo ? '!text-blue-700' : ''}`} title="Member numbers" onClick={() => o('memberNo')(!opts.memberNo)}><Hash className="w-3.5 h-3.5" />Members</button>
                <button className={`tool-btn ${opts.secNames ? '!text-blue-700' : ''}`} title="Section names" onClick={() => o('secNames')(!opts.secNames)}><Type className="w-3.5 h-3.5" />Sections</button>
                <button className={`tool-btn ${opts.localAxes ? '!text-blue-700' : ''}`} title="Member local axes: x red, y green, z blue" onClick={() => o('localAxes')(!opts.localAxes)}><Axis3d className="w-3.5 h-3.5" />Axes</button>
                <button className={`tool-btn ${opts.restraints ? '!text-blue-700' : ''}`} title="Restraints and spring supports at the nodes" onClick={() => o('restraints')(!opts.restraints)}><Anchor className="w-3.5 h-3.5" />Restraints</button>
                <button className={`tool-btn ${opts.releases ? '!text-blue-700' : ''}`} title="Member end releases and springs" onClick={() => o('releases')(!opts.releases)}><Unlink className="w-3.5 h-3.5" />Releases</button>
                <button className={`tool-btn ${opts.loads ? '!text-blue-700' : ''}`} title="Loads of the case shown" onClick={() => o('loads')(!opts.loads)}><Weight className="w-3.5 h-3.5" />Loads</button>
                <button className={`tool-btn ${opts.notes ? '!text-blue-700' : ''}`} title="Notes on nodes and members" onClick={() => o('notes')(!opts.notes)}><StickyNote className="w-3.5 h-3.5" />Notes</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {dialog === 'about' && <About onClose={() => setDialog(null)} />}
      {dialog === 'new' && <TemplateDialog onClose={() => setDialog(null)} onCreate={m => { setModel(() => m); setFitRev(r => r + 1); setSel(noSel()); setCaseId(1); setModeIx(null); setDialog(null); setTab('structure'); }} />}
      {dialog === 'load' && <LoadDialog kind={loadKind} count={loadKind === 'node' ? sel.nodes.size : sel.members.size} cases={model.loadCases} lc0={lcOnly} onClose={() => setDialog(null)} onApply={applyLoad} />}
      {dialog === 'section' && <SectionDialog replace={replaceSec ?? undefined} assign={assignOnAdd ? mSel : 0} onClose={() => { setDialog(null); setAssignDraw(false); }} onAdd={(name, p, outline) => {
        if (replaceSec !== null) { // the section keeps its number; only its type and properties change
          setModel(m => ({ ...m, sections: m.sections.map(x => (x.id === replaceSec ? { id: x.id, name, A: Math.round(p.A), Iy: Math.round(p.Iy), Iz: Math.round(p.Iz), J: Math.round(p.J), outline } : x)) }));
          setReplaceSec(null); setDialog(null); return;
        }
        if (assignDraw) setDrawSec(model.sections.find(s => s.name === name)?.id ?? nextId(model.sections));
        setModel(m => {
          const ex = m.sections.find(s => s.name === name), id = ex?.id ?? nextId(m.sections);
          const sections = ex ? m.sections : [...m.sections, { id, name, A: Math.round(p.A), Iy: Math.round(p.Iy), Iz: Math.round(p.Iz), J: Math.round(p.J), outline }];
          return { ...m, sections, members: assignOnAdd ? m.members.map(x => (sel.members.has(x.id) ? { ...x, sec: id } : x)) : m.members };
        });
        setDialog(null); setAssignDraw(false);
      }} />}
      {dialog === 'report' && <ReportDialog info={info} setInfo={setInfo} onClose={() => setDialog(null)}
        fields={[['project', 'Project'], ['number', 'Project Number'], ['structure', 'Structure'], ['designer', 'Designer'], ['date', 'Date']]}
        onGenerate={async () => { const a = analysis ?? analyse(model); if (a.errors.length) throw new Error(a.errors[0]); const { makeReport } = await import('./report'); await makeReport(model, a, info, viewer.current?.svg() ?? null); }} />}
    </div>
  );
}
