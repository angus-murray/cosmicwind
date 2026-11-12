import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, Banner, useElementSize, Check, NumberField, ReportDialog, ResultsHeader, SelectField, StatusChip, today } from 'engineering-ui';
import { Axis3d, Box, Eye, Ruler, FilePlus, FolderOpen, Hash, Maximize, MousePointer2, Redo2, Save, Scissors, Spline, Trash2, Type, Undo2, Weight, Copy, Dot, LineChart, Shapes, Cuboid, Waypoints, StickyNote } from 'lucide-react';
import {
  deleteMembersAndFreeNodes, deleteNodes, DASH, FREE, MATERIAL_PRESETS, nextId, normalise, RELEASES, RESTRAINTS,
  type Combo, type DistLoad, type LoadCase, type Material, type Member, type Model, type Node, type NodeLoad, type NodeMass, type PointLoad, type Section, type Settlement, type Spring, type ThermalLoad,
} from './model/types';
import { defaultModel } from './model/templates';
import { analyse } from './solver/frame';
import { Sheet, type Col } from './ui/Sheet';
import { DIAGRAMS, STRESSES, fmt, Viewer, type StressKey, type Sel, type Tool, type ViewerHandle, type ViewOpts } from './ui/Viewer';
import { ResultTables } from './ui/Results';
import { ContextMenu, PromptBox, TextPromptBox, ToolFlyout, type MenuItem, type MenuState, type PromptState, type TextPromptState } from './ui/CanvasMenu';
import { About, LoadDialog, SectionDialog, TemplateDialog, type LoadSpec } from './ui/Dialogs';
import type { ReportInfo } from './report';

type Tab = 'structure' | 'loads' | 'results';
const STORE = 'moonrock-model';
const load = (): Model => { try { const s = localStorage.getItem(STORE); if (s) return normalise(JSON.parse(s)); } catch { /* fall through */ } return defaultModel(); };
const code = (v: string | number, old: string) => { const s = String(v).toUpperCase().trim(); return /^[-–—]?$/.test(s) ? DASH : /^[FR]{6}$/.test(s) ? s : old; };
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
  const [opts, setOpts] = useState<ViewOpts>({ notes: true, nodeNo: true, memberNo: true, secNames: false, loads: true, localAxes: false, diagrams: { N: false, T: false, Vy: false, Vz: false, Vres: false, Mz: true, My: false, Mres: false }, stress: 'none', deflected: false, reactions: true, values: true, scale: 1, defScale: 1, solid: false });
  const o = <K extends keyof ViewOpts>(k: K) => (v: ViewOpts[K]) => setOpts(p => ({ ...p, [k]: v }));
  const [caseId, setCaseId] = useState(1);
  const [modeIx, setModeIx] = useState<{ kind: 'buckling' | 'modal'; i: number } | null>(null);
  const [dialog, setDialog] = useState<'about' | 'report' | 'new' | 'section' | 'load' | null>(null);
  const [assignOnAdd, setAssignOnAdd] = useState(false);
  /** Section number whose type is being changed in the section dialog, or null when adding a section. */
  const [replaceSec, setReplaceSec] = useState<number | null>(null);
  const [secSel, setSecSel] = useState<number | null>(null);
  const [loadKind, setLoadKind] = useState<'node' | 'member'>('node');
  const [info, setInfo] = useState<ReportInfo>({ project: '', number: '', structure: '', designer: '', date: today() });
  const [copy, setCopy] = useState({ dx: 0, dy: 0, dz: 6, n: 1 });
  const [parts, setParts] = useState(4);
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
    return { ...m, members: [...m.members, { id: nextId(m.members), a, b, sec: last?.sec ?? m.sections[0].id, mat: last?.mat ?? m.materials[0]?.id ?? 1, angle: 0, type: 'N', relA: DASH, relB: DASH }] };
  });
  const delSel = useCallback(() => { setModel(m => deleteNodes(deleteMembersAndFreeNodes(m, sel.members), sel.nodes)); setSel(noSel()); }, [sel, setModel]);
  const patchMembers = (p: Partial<Member>) => setModel(m => ({ ...m, members: m.members.map(x => (sel.members.has(x.id) ? { ...x, ...p } : x)) }));
  const patchNodes = (p: Partial<Node>) => setModel(m => ({ ...m, nodes: m.nodes.map(x => (sel.nodes.has(x.id) ? { ...x, ...p } : x)) }));
  const subdivide = (np: number = parts, which: Set<number> = sel.members) => setModel(m => {
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
  const copySel = () => copyWith((n, k) => [n.x + copy.dx * k, n.y + copy.dy * k, n.z + copy.dz * k], copy.n);
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
  const nodeCols: Col<Node>[] = [{ key: 'x', label: 'X (m)' }, { key: 'y', label: 'Y (m)' }, { key: 'z', label: 'Z (m)' },
    { key: 'r', label: 'Restraint', type: 'text', w: 84, list: RESTRAINTS.map(r => r[0]), title: 'F fixed or R released, for DX DY DZ RX RY RZ', set: (r, v) => ({ ...r, r: code(v, r.r) }) }];
  const memCols: Col<Member>[] = [{ key: 'a', label: 'End 1', title: 'Node at end 1 of the member', w: 48 }, { key: 'b', label: 'End 2', title: 'Node at end 2 of the member', w: 48 }, idSel('sec', 'Section No.', secNo, 70), idSel('mat', 'Material', matOpt, 90),
    { key: 'angle', label: 'Angle (°)', w: 50 }, { key: 'type', label: 'Type', type: 'select', w: 96, options: [{ value: 'N', label: 'Normal' }, { value: 'T', label: 'Tension Only' }, { value: 'C', label: 'Compr. Only' }] },
    { key: 'relA', label: 'Release 1', type: 'text', w: 70, list: RELEASES.map(r => r[0]), title: 'F fixed or R released, for the local x y z forces and moments', set: (r, v) => ({ ...r, relA: code(v, r.relA) }) },
    { key: 'relB', label: 'Release 2', type: 'text', w: 70, list: RELEASES.map(r => r[0]), set: (r, v) => ({ ...r, relB: code(v, r.relB) }) }];
  const secCols: Col<Section>[] = [{ key: 'name', label: 'Section Type', type: 'text', w: 150 }, { key: 'A', label: <><i>A</i> (mm²)</>, w: 60 }, { key: 'Iz', label: <><i>I</i><sub>z</sub> (mm⁴)</>, w: 76 }, { key: 'Iy', label: <><i>I</i><sub>y</sub> (mm⁴)</>, w: 76 }, { key: 'J', label: <><i>J</i> (mm⁴)</>, w: 70 }];
  const matCols: Col<Material>[] = [{ key: 'name', label: 'Name', type: 'text', w: 110 }, { key: 'E', label: <><i>E</i> (MPa)</>, w: 60 }, { key: 'G', label: <><i>G</i> (MPa)</>, w: 60 }, { key: 'rho', label: 'Density (kg/m³)', w: 70 }, { key: 'alpha', label: <><i>α</i> (/°C)</>, w: 70 }];
  const kCol = (i: number, label: string): Col<Spring> => ({ key: `k${i}`, label, w: 62, get: r => r.k[i] ?? 0, set: (r, v) => ({ ...r, k: r.k.map((x, j) => (j === i ? Math.max(0, Number(v)) : x)) }) });
  const springCols: Col<Spring>[] = [{ key: 'node', label: 'Node', w: 44 }, ...['KX', 'KY', 'KZ'].map((l, i) => kCol(i, `${l} (kN/m)`)), ...['KRX', 'KRY', 'KRZ'].map((l, i) => kCol(i + 3, `${l} (kNm/rad)`))];
  const massCols: Col<NodeMass>[] = [{ key: 'node', label: 'Node' }, { key: 'm', label: 'Mass (t)' }];
  const lcCols: Col<LoadCase>[] = [{ key: 'name', label: 'Name', type: 'text', w: 130 }, { key: 'gx', label: 'Self-Wt X', title: 'Self-weight multiplier of g in global X' }, { key: 'gy', label: 'Self-Wt Y', title: 'Self-weight multiplier of g in global Y (−1 is downward)' }, { key: 'gz', label: 'Self-Wt Z' }];
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
    structure: [['nodes', 'Nodes'], ['members', 'Members'], ['sections', 'Sections'], ['materials', 'Materials'], ['springs', 'Springs'], ['masses', 'Masses']],
    loads: [['cases', 'Cases'], ['combos', 'Combinations'], ['node', 'Node Loads'], ['dist', 'Distributed'], ['point', 'Point'], ['settle', 'Settlements'], ['thermal', 'Temperature']],
  } as const;
  const st = sub.structure, ld = sub.loads;
  const nSel = sel.nodes.size, mSel = sel.members.size;

  const summary = useMemo(() => {
    if (!okRes) return null;
    let d = 0, dn = 0, mz = 0, mm = 0, nmax = 0, nmin = 0, fy = 0;
    okRes.disp.forEach((v, id) => { const t = Math.hypot(v[0], v[1], v[2]); if (t > d) { d = t; dn = id; } });
    okRes.members.forEach((r, id) => { for (const v of r.Mz) if (Math.abs(v) > Math.abs(mz)) { mz = v; mm = id; } nmax = Math.max(nmax, ...r.N); nmin = Math.min(nmin, ...r.N); });
    okRes.reactions.forEach(r => { fy += r[1]; });
    return { d, dn, mz, mm, nmax, nmin, fy };
  }, [okRes]);

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
        <div className="tab-grid lg:!grid-cols-[minmax(320px,1fr)_minmax(0,900px)_minmax(320px,1fr)]">
          <div className="input-column scroll-thin">
            {tab !== 'results' && <>
              <div className="panel">
                <h2 className="panel-title">Load Case</h2>
                <SelectField label="Case Shown" value={String(cur?.id ?? '')} onChange={v => setCaseId(Number(v))} options={cases.map(c => ({ value: String(c.id), label: `${c.id}: ${c.name}` }))} />
              </div>
            </>}
            {tab === 'structure' && (nSel > 0 || mSel > 0) && <div className="panel">
              <h2 className="panel-title">Selection: {[nSel && `${nSel} Node${nSel > 1 ? 's' : ''}`, mSel && `${mSel} Member${mSel > 1 ? 's' : ''}`].filter(Boolean).join(', ')}</h2>
              <div className="grid grid-cols-2 gap-2">
                {nSel > 0 && <SelectField label="Restraint" value="" onChange={v => v && patchNodes({ r: v })} options={[{ value: '', label: 'Set…' }, ...RESTRAINTS.map(([c, l]) => ({ value: c, label: `${l} (${c})` }))]} />}
                {mSel > 0 && <>
                  <SelectField label="Section" value="" onChange={v => v && patchMembers({ sec: Number(v) })} options={[{ value: '', label: 'Set…' }, ...secOpt]} />
                  <SelectField label="End Releases" value="" onChange={v => v && patchMembers({ relA: v, relB: v })} options={[{ value: '', label: 'Set…' }, ...RELEASES.map(([c, l]) => ({ value: c, label: `${l} (${c})` }))]} />
                  <SelectField label="Type" value="" onChange={v => v && patchMembers({ type: v as Member['type'] })} options={[{ value: '', label: 'Set…' }, { value: 'N', label: 'Normal' }, { value: 'T', label: 'Tension Only' }, { value: 'C', label: 'Compression Only' }]} />
                </>}
              </div>
              {mSel > 0 && <div className="section grid grid-cols-2 gap-2 items-end">
                <NumberField label="Subdivide Into" value={parts} min={2} max={50} onChange={setParts} />
                <button className="btn" onClick={() => subdivide()}><Scissors className="w-3.5 h-3.5" /> Subdivide</button>
              </div>}
              <div className="section space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <NumberField label="Copy DX (m)" value={copy.dx} onChange={v => setCopy({ ...copy, dx: v })} /><NumberField label="DY (m)" value={copy.dy} onChange={v => setCopy({ ...copy, dy: v })} />
                  <NumberField label="DZ (m)" value={copy.dz} onChange={v => setCopy({ ...copy, dz: v })} /><NumberField label="Copies" value={copy.n} min={1} max={100} onChange={v => setCopy({ ...copy, n: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn" title="Copies the selected nodes and members, with their loads, at the given spacing" onClick={copySel}><Copy className="w-3.5 h-3.5" /> Copy</button>
                  <button className="btn !text-rose-700" onClick={delSel}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </div>
              </div>
            </div>}
            {tab === 'results' && <>
              <div className="panel">
                <h2 className="panel-title">Analysis</h2>
                <Check checked={model.settings.nonlinear} onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, nonlinear: v } }))} title="Iterates with the geometric stiffness from the member axial forces">Second-Order (P-Δ) Analysis</Check>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label="Buckling Modes" value={model.settings.bucklingModes} min={0} max={20} onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, bucklingModes: Math.round(v) } }))} />
                  <NumberField label="Vibration Modes" value={model.settings.modalModes} min={0} max={30} onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, modalModes: Math.round(v) } }))} />
                  <NumberField label="Stations" value={model.settings.stations} min={3} max={101} title="Result points along each member" onChange={v => setModel(m => ({ ...m, settings: { ...m.settings, stations: Math.round(v) } }))} />
                </div>
              </div>
              <div className="panel">
                <h2 className="panel-title">Display</h2>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField label="Case" value={String(cur?.id ?? '')} onChange={v => { setCaseId(Number(v)); setModeIx(m => (m?.kind === 'buckling' ? null : m)); }} options={cases.map(c => ({ value: String(c.id), label: `${c.id}: ${c.name}` }))} />
                  <NumberField label="Diagram Scale" value={opts.scale} min={0.1} max={20} step={0.25} onChange={o('scale')} />
                  <NumberField label="Deflection Scale" value={opts.defScale} min={0.1} max={20} step={0.25} onChange={o('defScale')} />
                </div>
                <SelectField label="Stress in Rendered View" value={opts.stress} onChange={v => setOpts(q => ({ ...q, stress: v as StressKey, solid: v !== 'none' ? true : q.solid }))} options={STRESSES.map(t => ({ value: t.key, label: t.label }))} />
                <div className="section">
                  <h3 className="label mb-1">Diagrams</h3>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    {DIAGRAMS.map(d => <Check key={d.key} checked={opts.diagrams[d.key]} onChange={v => o('diagrams')({ ...opts.diagrams, [d.key]: v })}><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: d.colour }} />{d.label}</Check>)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                  <Check checked={opts.deflected} onChange={o('deflected')}>Deflected Shape</Check><Check checked={opts.reactions} onChange={o('reactions')}>Reactions</Check>
                  <Check checked={opts.values} onChange={o('values')}>Values</Check><Check checked={opts.loads} onChange={o('loads')}>Loads</Check>
                </div>
              </div>
            </>}
          </div>

          <div className="results-column">
            <div ref={cvRef} className="relative bg-slate-50 rounded-lg border border-slate-200 shadow-2xs overflow-hidden h-[520px] lg:h-auto lg:flex-1 lg:min-h-[240px]">
              <Viewer ref={viewer} notes={model.notes} onNoteMove={(id, dx, dy) => setModel(m => ({ ...m, notes: m.notes.map(n => (n.id === id ? { ...n, dx, dy } : n)) }))} onNoteEdit={(id, x, y) => { const nt = model.notes.find(n => n.id === id); if (nt) setTextPrompt({ x, y, title: 'Edit Note', text: nt.text, onSubmit: t => setNote(nt.kind, nt.ref, nt.id, t) }); }} fitRev={fitRev} onSplitMember={splitMember} pick={pickMove} onPickEnd={() => setPickMove(null)} model={model} opts={opts} tool={tool} sel={sel} onSelect={setSel} loadCases={drawLoads} result={tab === 'results' ? okRes : null} mode={tab === 'results' ? modeShape : null} onAddNode={addNode} onAddMember={addMember}
                onContext={c => { setCtx(c); if (c.node !== null && !sel.nodes.has(c.node)) setSel({ nodes: new Set([c.node]), members: new Set() }); else if (c.node === null && c.member !== null && !sel.members.has(c.member)) setSel({ nodes: new Set(), members: new Set([c.member]) }); }} />
              {ctx && menuOf() && <ContextMenu menu={menuOf()!} W={cvSize.width} H={cvSize.height} onClose={() => setCtx(null)} />}
              {textPrompt && <TextPromptBox prompt={textPrompt} W={cvSize.width} H={cvSize.height} onClose={() => setTextPrompt(null)} />}
              {prompt && <PromptBox prompt={prompt} W={cvSize.width} H={cvSize.height} onClose={() => setPrompt(null)} />}
              {tab !== 'results' && <div className="absolute top-2 left-2 toolbar w-[104px]">
                  <button className={`tool-btn ${tool === 'select' ? 'tool-btn-active' : ''}`} onClick={() => setTool('select')}><MousePointer2 className="w-3.5 h-3.5" />Select</button>
                  <button className={`tool-btn ${tool === 'node' ? 'tool-btn-active' : ''}`} title="Click to add nodes on the XY plane (Z = 0), snapped to 0.5 m" onClick={() => setTool('node')}><Dot className="w-3.5 h-3.5" />Node</button>
                  <button className={`tool-btn ${tool === 'member' ? 'tool-btn-active' : ''}`} title="Click node to node to add members; Escape ends the chain" onClick={() => setTool('member')}><Spline className="w-3.5 h-3.5" />Member</button>
                  <button className={`tool-btn ${tool === 'measure' ? 'tool-btn-active' : ''}`} title="Click two points to measure the distance; nodes snap, Esc clears" onClick={() => setTool('measure')}><Ruler className="w-3.5 h-3.5" />Measure</button>
                  <button className="tool-btn" disabled={!nSel && !mSel} onClick={delSel}><Trash2 className="w-3.5 h-3.5" />Delete</button>
              </div>}
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
                {tab !== 'results' && <button className={`tool-btn ${opts.loads ? '!text-blue-700' : ''}`} title="Loads of the case shown" onClick={() => o('loads')(!opts.loads)}><Weight className="w-3.5 h-3.5" />Loads</button>}
                <button className={`tool-btn ${opts.notes ? '!text-blue-700' : ''}`} title="Notes on nodes and members" onClick={() => o('notes')(!opts.notes)}><StickyNote className="w-3.5 h-3.5" />Notes</button>
                </div>
              </div>
            </div>
          </div>

          <div className="input-column scroll-thin">
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
                {st === 'springs' && <Sheet rows={model.springs} cols={springCols} onChange={set('springs')} newRow={() => ({ node: firstNode, k: [0, 0, 0, 0, 0, 0] })} empty="No spring supports" />}
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
            {tab === 'results' && <>
              {summary && okRes && <div className="panel">
                <h2 className="panel-title">Summary: Case {okRes.id}</h2>
                <div className="readout"><span>Maximum Displacement</span><span className="readout-value">{fmt(summary.d * 1000)} mm at node {summary.dn}</span></div>
                <div className="readout"><span>Maximum Moment <i>M</i><sub>z</sub></span><span className="readout-value">{fmt(summary.mz)} kNm in member {summary.mm}</span></div>
                <div className="readout"><span>Maximum Tension</span><span className="readout-value">{fmt(summary.nmax)} kN</span></div>
                <div className="readout"><span>Maximum Compression</span><span className="readout-value">{fmt(-summary.nmin)} kN</span></div>
                <div className="readout"><span>Total Vertical Reaction</span><span className="readout-value">{fmt(summary.fy)} kN</span></div>
                {okRes.buckling?.values.length ? <div className="readout"><span>Buckling Load Factor</span><span className="readout-value">{fmt(okRes.buckling.values[0])}</span></div> : null}
                {analysis?.modal?.values.length ? <div className="readout"><span>Fundamental Frequency</span><span className="readout-value">{fmt(analysis.modal.values[0])} Hz</span></div> : null}
                {okRes.iterations > 1 && <div className="readout"><span>Iterations</span><span className="readout-value">{okRes.iterations}</span></div>}
              </div>}
            </>}
            {tab === 'results' && analysis && <div className="panel flex flex-col !space-y-2">
              <ResultsHeader title={cur ? `Results: Case ${cur.id}, ${cur.name}` : 'Results'}>
                {analysis.errors.length ? <StatusChip kind="fail">Not Solved</StatusChip> : res?.error ? <StatusChip kind="fail">Case Not Solved</StatusChip>
                  : <StatusChip kind="pass">{model.settings.nonlinear ? 'Second-Order' : 'Linear'} Analysis Solved in {analysis.ms < 10 ? analysis.ms.toFixed(1) : analysis.ms.toFixed(0)} ms</StatusChip>}
                {modeShape && <StatusChip kind="neutral">{modeIx!.kind === 'modal' ? 'Vibration' : 'Buckling'} Mode {modeIx!.i + 1} Shown</StatusChip>}
              </ResultsHeader>
              {analysis.errors.length > 0 && <Banner kind="error" title="The model could not be analysed" items={analysis.errors} />}
              {analysis.warnings.length > 0 && <Banner kind="warning" title="Warnings" items={analysis.warnings} />}
              {okRes && <ResultTables model={model} analysis={analysis} res={okRes} sel={sel} onSelect={setSel} modeIx={modeIx} setModeIx={setModeIx} />}
            </div>}
          </div>
        </div>
      </main>
      {dialog === 'about' && <About onClose={() => setDialog(null)} />}
      {dialog === 'new' && <TemplateDialog onClose={() => setDialog(null)} onCreate={m => { setModel(() => m); setFitRev(r => r + 1); setSel(noSel()); setCaseId(1); setModeIx(null); setDialog(null); setTab('structure'); }} />}
      {dialog === 'load' && <LoadDialog kind={loadKind} count={loadKind === 'node' ? sel.nodes.size : sel.members.size} cases={model.loadCases} lc0={lcOnly} onClose={() => setDialog(null)} onApply={applyLoad} />}
      {dialog === 'section' && <SectionDialog replace={replaceSec ?? undefined} assign={assignOnAdd ? mSel : 0} onClose={() => setDialog(null)} onAdd={(name, p, outline) => {
        if (replaceSec !== null) { // the section keeps its number; only its type and properties change
          setModel(m => ({ ...m, sections: m.sections.map(x => (x.id === replaceSec ? { id: x.id, name, A: Math.round(p.A), Iy: Math.round(p.Iy), Iz: Math.round(p.Iz), J: Math.round(p.J), outline } : x)) }));
          setReplaceSec(null); setDialog(null); return;
        }
        setModel(m => {
          const ex = m.sections.find(s => s.name === name), id = ex?.id ?? nextId(m.sections);
          const sections = ex ? m.sections : [...m.sections, { id, name, A: Math.round(p.A), Iy: Math.round(p.Iy), Iz: Math.round(p.Iz), J: Math.round(p.J), outline }];
          return { ...m, sections, members: assignOnAdd ? m.members.map(x => (sel.members.has(x.id) ? { ...x, sec: id } : x)) : m.members };
        });
        setDialog(null);
      }} />}
      {dialog === 'report' && <ReportDialog info={info} setInfo={setInfo} onClose={() => setDialog(null)}
        fields={[['project', 'Project'], ['number', 'Project Number'], ['structure', 'Structure'], ['designer', 'Designer'], ['date', 'Date']]}
        onGenerate={async () => { const a = analysis ?? analyse(model); if (a.errors.length) throw new Error(a.errors[0]); const { makeReport } = await import('./report'); await makeReport(model, a, info, viewer.current?.svg() ?? null); }} />}
    </div>
  );
}
