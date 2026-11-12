import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, Banner, Check, NumberField, ReportDialog, ResultsHeader, SelectField, StatusChip, today } from 'engineering-ui';
import { Axis3d, Box, FilePlus, FolderOpen, Grid3x3, Hash, Maximize, MousePointer2, Redo2, Save, Scissors, Spline, Trash2, Type, Undo2, Weight, Copy, Dot, LineChart, Shapes, Cuboid, Waypoints } from 'lucide-react';
import {
  deleteMembers, deleteNodes, FREE, MATERIAL_PRESETS, nextId, normalise, RELEASES, RESTRAINTS,
  type Combo, type DistLoad, type LoadCase, type Material, type Member, type Model, type Node, type NodeLoad, type NodeMass, type PointLoad, type Section, type Settlement, type Spring, type ThermalLoad,
} from './model/types';
import { defaultModel } from './model/templates';
import { analyse } from './solver/frame';
import { Sheet, type Col } from './ui/Sheet';
import { fmt, Viewer, type Diagram, type Sel, type Tool, type ViewerHandle, type ViewOpts } from './ui/Viewer';
import { ResultTables } from './ui/Results';
import { ContextMenu, type MenuItem } from './ui/ContextMenu';
import { About, SectionDialog, TemplateDialog } from './ui/Dialogs';
import type { ReportInfo } from './report';

type Tab = 'structure' | 'loads' | 'results';
const STORE = 'moonrock-model';
const load = (): Model => { try { const s = localStorage.getItem(STORE); if (s) return normalise(JSON.parse(s)); } catch { /* fall through */ } return defaultModel(); };
const code = (v: string | number, old: string) => { const s = String(v).toUpperCase().trim(); return /^[FR]{6}$/.test(s) ? s : old; };
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
  const [opts, setOpts] = useState<ViewOpts>({ nodeNo: true, memberNo: true, secNames: false, loads: true, localAxes: false, diagram: 'Mz', deflected: false, reactions: true, values: true, scale: 1, defScale: 1, plane: 'XY', offset: 0, snap: 0.5, solid: false });
  const o = <K extends keyof ViewOpts>(k: K) => (v: ViewOpts[K]) => setOpts(p => ({ ...p, [k]: v }));
  const [caseId, setCaseId] = useState(1);
  const [modeIx, setModeIx] = useState<{ kind: 'buckling' | 'modal'; i: number } | null>(null);
  const [dialog, setDialog] = useState<'about' | 'report' | 'new' | 'section' | null>(null);
  const [info, setInfo] = useState<ReportInfo>({ project: '', number: '', structure: '', designer: '', date: today() });
  const [copy, setCopy] = useState({ dx: 0, dy: 0, dz: 6, n: 1 });
  const [parts, setParts] = useState(4);
  const viewer = useRef<ViewerHandle>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; node: number | null; member: number | null } | null>(null);
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
    return { ...m, members: [...m.members, { id: nextId(m.members), a, b, sec: last?.sec ?? m.sections[0].id, mat: last?.mat ?? m.materials[0]?.id ?? 1, angle: 0, type: 'N', relA: 'FFFFFF', relB: 'FFFFFF' }] };
  });
  const delSel = useCallback(() => { setModel(m => deleteNodes(deleteMembers(m, sel.members), sel.nodes)); setSel(noSel()); }, [sel, setModel]);
  const patchMembers = (p: Partial<Member>) => setModel(m => ({ ...m, members: m.members.map(x => (sel.members.has(x.id) ? { ...x, ...p } : x)) }));
  const patchNodes = (p: Partial<Node>) => setModel(m => ({ ...m, nodes: m.nodes.map(x => (sel.nodes.has(x.id) ? { ...x, ...p } : x)) }));
  const subdivide = (np: number = parts) => setModel(m => {
    const n = Math.max(2, Math.round(np)), nodes = m.nodes.slice(), members: Member[] = [], out = { ...m };
    let nid = nextId(nodes), mid = nextId(m.members);
    const dist: DistLoad[] = [], point: PointLoad[] = [], thermal: ThermalLoad[] = [];
    for (const mb of m.members) {
      const a = nodes.find(x => x.id === mb.a), b = nodes.find(x => x.id === mb.b);
      if (!sel.members.has(mb.id) || !a || !b) { members.push(mb); continue; }
      const ids = [mb.a], mids: number[] = [];
      for (let i = 1; i < n; i++) { const t = i / n; nodes.push({ id: nid, x: +(a.x + (b.x - a.x) * t).toFixed(6), y: +(a.y + (b.y - a.y) * t).toFixed(6), z: +(a.z + (b.z - a.z) * t).toFixed(6), r: /^..F..R$/.test(a.r) && /^..F..R$/.test(b.r) ? 'RRFFFR' : FREE }); ids.push(nid++); }
      ids.push(mb.b);
      for (let i = 0; i < n; i++) { const id = i === 0 ? mb.id : mid++; mids.push(id); members.push({ ...mb, id, a: ids[i], b: ids[i + 1], relA: i === 0 ? mb.relA : 'FFFFFF', relB: i === n - 1 ? mb.relB : 'FFFFFF' }); }
      for (const l of m.distLoads.filter(x => x.member === mb.id)) for (let i = 0; i < n; i++) {
        const lo = Math.max(l.s, 100 * i / n), hi = Math.min(l.e, 100 * (i + 1) / n); if (hi - lo < 1e-9) continue;
        const w = (p: number) => l.w1 + (l.w2 - l.w1) * (p - l.s) / (l.e - l.s);
        dist.push({ ...l, member: mids[i], w1: w(lo), w2: w(hi), s: +(lo * n - 100 * i).toFixed(6), e: +(hi * n - 100 * i).toFixed(6) });
      }
      for (const l of m.pointLoads.filter(x => x.member === mb.id)) { const i = Math.min(n - 1, Math.floor(l.pos * n / 100)); point.push({ ...l, member: mids[i], pos: +(l.pos * n - 100 * i).toFixed(6) }); }
      for (const l of m.thermal.filter(x => x.member === mb.id)) mids.forEach(id => thermal.push({ ...l, member: id }));
    }
    const keep = <T extends { member: number }>(a: T[]) => a.filter(x => !sel.members.has(x.member));
    return { ...out, nodes, members, distLoads: [...keep(m.distLoads), ...dist], pointLoads: [...keep(m.pointLoads), ...point], thermal: [...keep(m.thermal), ...thermal] };
  });
  const copySel = () => setModel(m => {
    const mem = m.members.filter(x => sel.members.has(x.id) || (sel.nodes.has(x.a) && sel.nodes.has(x.b)));
    const ids = new Set([...sel.nodes, ...mem.flatMap(x => [x.a, x.b])]), nodes = m.nodes.slice(), members = m.members.slice();
    const dist = m.distLoads.slice(), point = m.pointLoads.slice(), nl = m.nodeLoads.slice();
    let nid = nextId(nodes), mid = nextId(members);
    for (let c = 1; c <= Math.max(1, Math.round(copy.n)); c++) {
      const map = new Map<number, number>();
      for (const n of m.nodes.filter(x => ids.has(x.id))) {
        const p = [n.x + copy.dx * c, n.y + copy.dy * c, n.z + copy.dz * c].map(v => +v.toFixed(6));
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

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement, typing = /INPUT|SELECT|TEXTAREA/.test(el.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && tab !== 'results' && (sel.nodes.size || sel.members.size)) { e.preventDefault(); delSel(); }
      else if (e.key === 'Escape' && !typing) setTool('select');
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [undo, redo, delSel, sel, tab]);
  useEffect(() => { if (tab === 'results') setTool('select'); }, [tab]);

  const menuItems = (): MenuItem[] => {
    if (!ctx) return [];
    const edit = tab !== 'results', nodes = [...sel.nodes], mems = [...sel.members];
    const plural = (n: number, w: string) => (n === 1 ? `${w} ${n === 1 ? (w === 'Node' ? nodes[0] : mems[0]) : ''}` : `${n} ${w}s`);
    const pick = (nn: Iterable<number>, mm: Iterable<number>) => setSel({ nodes: new Set(nn), members: new Set(mm) });
    const items: MenuItem[] = [];
    if (ctx.node !== null && nodes.length) {
      items.push({ title: true, label: plural(nodes.length, 'Node') });
      if (edit) items.push({ label: 'Restraint', children: RESTRAINTS.map(([c, l]) => ({ label: `${l} (${c})`, onClick: () => patchNodes({ r: c }) })) });
      items.push({ label: 'Select Connected Members', onClick: () => pick(sel.nodes, [...sel.members, ...model.members.filter(m => sel.nodes.has(m.a) || sel.nodes.has(m.b)).map(m => m.id)]) });
      if (edit) items.push({ sep: true }, { label: nodes.length > 1 ? 'Delete Nodes' : 'Delete Node', danger: true, onClick: delSel });
    } else if (ctx.member !== null && mems.length) {
      items.push({ title: true, label: plural(mems.length, 'Member') });
      if (edit) items.push(
        { label: 'Section', children: [...model.sections.map(x => ({ label: x.name, onClick: () => patchMembers({ sec: x.id }) })), { sep: true }, { label: 'Add Section…', onClick: () => setDialog('section') }] },
        { label: 'End Releases', children: RELEASES.map(([c, l]) => ({ label: `${l} (${c})`, onClick: () => patchMembers({ relA: c, relB: c }) })) },
        { label: 'Member Type', children: ([['N', 'Normal'], ['T', 'Tension Only'], ['C', 'Compression Only']] as const).map(([c, l]) => ({ label: l, onClick: () => patchMembers({ type: c }) })) },
        { label: 'Subdivide', children: [2, 3, 4, 5, 6, 8, 10].map(k => ({ label: `Into ${k} Parts`, onClick: () => subdivide(k) })) },
      );
      items.push({ label: 'Select Connected Nodes', onClick: () => pick([...sel.nodes, ...model.members.filter(m => sel.members.has(m.id)).flatMap(m => [m.a, m.b])], sel.members) });
      if (edit) items.push({ sep: true }, { label: mems.length > 1 ? 'Delete Members' : 'Delete Member', danger: true, onClick: delSel });
    } else {
      items.push({ label: 'Select All', onClick: () => pick(model.nodes.map(n => n.id), model.members.map(m => m.id)) },
        { label: 'Clear Selection', disabled: !nodes.length && !mems.length, onClick: () => setSel(noSel()) }, { sep: true }, { label: 'Fit View', onClick: () => viewer.current?.fit() });
    }
    return items;
  };

  const save = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(model, null, 1)], { type: 'application/json' }));
    a.download = `${(model.title || 'model').replace(/[^\w-]+/g, '_')}.moondust.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const open = async (f: File | undefined) => {
    if (!f) return;
    try { const m = normalise(JSON.parse(await f.text())); if (!Array.isArray(m.nodes)) throw new Error(); setModel(() => m); setSel(noSel()); }
    catch { alert('The file is not a MoonDust model.'); }
  };

  // ---- Datasheet columns
  const secOpt = opt(model.sections), matOpt = opt(model.materials), lcOpt = opt(model.loadCases);
  const idSel = (key: string, label: string, options: { value: string; label: string }[], w = 90): Col<any> => ({ key, label, type: 'select', options, w, set: (r: object, v: string | number) => ({ ...r, [key]: Number(v) }) }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const nodeCols: Col<Node>[] = [{ key: 'x', label: 'X (m)' }, { key: 'y', label: 'Y (m)' }, { key: 'z', label: 'Z (m)' },
    { key: 'r', label: 'Restraint', type: 'text', w: 84, list: RESTRAINTS.map(r => r[0]), title: 'F fixed or R released, for DX DY DZ RX RY RZ', set: (r, v) => ({ ...r, r: code(v, r.r) }) }];
  const memCols: Col<Member>[] = [{ key: 'a', label: 'Node A', w: 48 }, { key: 'b', label: 'Node B', w: 48 }, idSel('sec', 'Section', secOpt, 120), idSel('mat', 'Material', matOpt, 90),
    { key: 'angle', label: 'Angle (°)', w: 50 }, { key: 'type', label: 'Type', type: 'select', w: 96, options: [{ value: 'N', label: 'Normal' }, { value: 'T', label: 'Tension Only' }, { value: 'C', label: 'Compr. Only' }] },
    { key: 'relA', label: 'Release A', type: 'text', w: 70, list: RELEASES.map(r => r[0]), title: 'F fixed or R released, for the local x y z forces and moments', set: (r, v) => ({ ...r, relA: code(v, r.relA) }) },
    { key: 'relB', label: 'Release B', type: 'text', w: 70, list: RELEASES.map(r => r[0]), set: (r, v) => ({ ...r, relB: code(v, r.relB) }) }];
  const secCols: Col<Section>[] = [{ key: 'name', label: 'Name', type: 'text', w: 120 }, { key: 'A', label: <><i>A</i> (mm²)</>, w: 60 }, { key: 'Iz', label: <><i>I</i><sub>z</sub> (mm⁴)</>, w: 76 }, { key: 'Iy', label: <><i>I</i><sub>y</sub> (mm⁴)</>, w: 76 }, { key: 'J', label: <><i>J</i> (mm⁴)</>, w: 70 }];
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
    <div className="fill-window min-h-screen bg-slate-100 lg:h-screen lg:overflow-hidden flex flex-col">
      <AppHeader name="MoonDust" logoSrc="/favicon.svg" onAbout={() => setDialog('about')} onReport={() => setDialog('report')}
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
      <main className="flex-1 flex flex-col lg:min-h-0 p-3 max-w-[1600px] w-full mx-auto">
        <div className="tab-grid lg:!grid-cols-[minmax(460px,1fr)_minmax(0,2fr)]">
          <div className="input-column scroll-thin">
            {tab !== 'results' && <div className="panel">
              <div className="flex gap-1 flex-wrap">{SUBS[tab].map(([k, l]) => <button key={k} className={`subtab ${sub[tab] === k ? 'subtab-active' : ''}`} onClick={() => setSub({ ...sub, [tab]: k })}>{l}</button>)}</div>
              {tab === 'structure' && <>
                {st === 'nodes' && <Sheet rows={model.nodes} cols={nodeCols} onChange={set('nodes')} rowLabel={idLabel} selected={r => sel.nodes.has(r.id)} onSelect={pickN}
                  newRow={() => { const l = model.nodes[model.nodes.length - 1]; return { id: nextId(model.nodes), x: l?.x ?? 0, y: l?.y ?? 0, z: l?.z ?? 0, r: FREE }; }}
                  onDelete={r => setModel(m => deleteNodes(m, new Set([r.id])))} />}
                {st === 'members' && <Sheet rows={model.members} cols={memCols} onChange={v => setModel(m => ({ ...ensureSection(m), members: v }))} rowLabel={idLabel} selected={r => sel.members.has(r.id)} onSelect={pickM}
                  newRow={() => { const l = model.members[model.members.length - 1]; return { id: nextId(model.members), a: l?.b ?? model.nodes[0]?.id ?? 1, b: model.nodes[model.nodes.length - 1]?.id ?? 2, sec: l?.sec ?? model.sections[0]?.id ?? 1, mat: l?.mat ?? model.materials[0]?.id ?? 1, angle: 0, type: 'N' as const, relA: 'FFFFFF', relB: 'FFFFFF' }; }}
                  onDelete={r => setModel(m => deleteMembers(m, new Set([r.id])))} />}
                {st === 'sections' && <>
                  <Sheet rows={model.sections} cols={secCols} onChange={set('sections')} rowLabel={idLabel} newRow={() => ({ id: nextId(model.sections), name: `Section ${nextId(model.sections)}`, A: 5000, Iy: 1e7, Iz: 5e7, J: 1e5 })}
                    onDelete={r => (used('sec', r.id) ? alert(`Section ${r.id} is used by members.`) : set('sections')(model.sections.filter(s => s.id !== r.id)))} />
                  <button className="btn-primary" onClick={() => setDialog('section')}><Shapes className="w-3.5 h-3.5" /> Add From Library or Shape</button>
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
                  <SelectField label="Diagram" value={opts.diagram} onChange={v => o('diagram')(v as Diagram)} options={[{ value: 'none', label: 'None' }, { value: 'Mz', label: 'Bending Moment Mz' }, { value: 'My', label: 'Bending Moment My' }, { value: 'Vy', label: 'Shear Force Vy' }, { value: 'Vz', label: 'Shear Force Vz' }, { value: 'N', label: 'Axial Force' }, { value: 'T', label: 'Torsion' }]} />
                  <NumberField label="Diagram Scale" value={opts.scale} min={0.1} max={20} step={0.25} onChange={o('scale')} />
                  <NumberField label="Deflection Scale" value={opts.defScale} min={0.1} max={20} step={0.25} onChange={o('defScale')} />
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                  <Check checked={opts.deflected} onChange={o('deflected')}>Deflected Shape</Check><Check checked={opts.reactions} onChange={o('reactions')}>Reactions</Check>
                  <Check checked={opts.values} onChange={o('values')}>Values</Check><Check checked={opts.loads} onChange={o('loads')}>Loads</Check>
                </div>
              </div>
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
          </div>

          <div className="results-column">
            <div className="relative bg-slate-50 rounded-lg border border-slate-200 shadow-2xs overflow-hidden h-[520px] lg:h-auto lg:flex-1 lg:min-h-[240px]">
              <Viewer ref={viewer} model={model} opts={opts} tool={tool} sel={sel} onSelect={setSel} loadCases={drawLoads} result={tab === 'results' ? okRes : null} mode={tab === 'results' ? modeShape : null} onAddNode={addNode} onAddMember={addMember}
                onContext={c => { setCtx(c); if (c.node !== null && !sel.nodes.has(c.node)) setSel({ nodes: new Set([c.node]), members: new Set() }); else if (c.node === null && c.member !== null && !sel.members.has(c.member)) setSel({ nodes: new Set(), members: new Set([c.member]) }); }} />
              {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={menuItems()} onClose={() => setCtx(null)} />}
              {tab !== 'results' && <div className="absolute top-2 left-2 toolbar w-[104px]">
                  <button className={`tool-btn ${tool === 'select' ? 'tool-btn-active' : ''}`} onClick={() => setTool('select')}><MousePointer2 className="w-3.5 h-3.5" />Select</button>
                  <button className={`tool-btn ${tool === 'node' ? 'tool-btn-active' : ''}`} title="Click on the working plane to add nodes" onClick={() => setTool('node')}><Dot className="w-3.5 h-3.5" />Node</button>
                  <button className={`tool-btn ${tool === 'member' ? 'tool-btn-active' : ''}`} title="Click node to node to add members; Escape ends the chain" onClick={() => setTool('member')}><Spline className="w-3.5 h-3.5" />Member</button>
                  <button className="tool-btn" disabled={!nSel && !mSel} onClick={delSel}><Trash2 className="w-3.5 h-3.5" />Delete</button>
              </div>}
              <div className="absolute top-2 right-2 flex flex-col items-end gap-2">
                <div className="flex items-start gap-2">
                {tool !== 'select' && <div className="bg-white border border-slate-200 rounded-lg shadow-2xs p-2 flex items-end gap-2 w-[300px]">
                  <Grid3x3 className="w-3.5 h-3.5 text-slate-500 mb-2 shrink-0" />
                  <SelectField label="Plane" value={opts.plane} onChange={v => o('plane')(v as ViewOpts['plane'])} options={[{ value: 'XY', label: 'XY' }, { value: 'XZ', label: 'XZ' }, { value: 'YZ', label: 'YZ' }]} />
                  <NumberField label={`${{ XY: 'Z', XZ: 'Y', YZ: 'X' }[opts.plane]} (m)`} value={opts.offset} step={0.5} onChange={o('offset')} />
                  <NumberField label="Snap (m)" value={opts.snap} min={0} step={0.1} onChange={o('snap')} />
                </div>}
                {tab !== 'results' && <select className="control-sm !w-48 bg-white" title="Case whose loads are shown" value={String(cur?.id ?? '')} onChange={e => setCaseId(Number(e.target.value))}>{cases.map(c => <option key={c.id} value={c.id}>{c.id}: {c.name}</option>)}</select>}
                </div>
                <div className="toolbar w-[112px]">
                <button className="tool-btn" onClick={() => viewer.current?.fit()}><Maximize className="w-3.5 h-3.5" />Fit</button>
                {(['iso', 'front', 'top', 'side'] as const).map(v => <button key={v} className="tool-btn" onClick={() => viewer.current?.view(v)}><Box className="w-3.5 h-3.5" />{{ iso: '3D', front: 'Front', top: 'Top', side: 'Side' }[v]}</button>)}
                <div className="tool-sep" />
                <button className={`tool-btn ${!opts.solid ? 'tool-btn-active' : ''}`} title="Wireframe view" onClick={() => o('solid')(false)}><Waypoints className="w-3.5 h-3.5" />Wireframe</button>
                <button className={`tool-btn ${opts.solid ? 'tool-btn-active' : ''}`} title="Rendered 3D view of the member cross sections" onClick={() => o('solid')(true)}><Cuboid className="w-3.5 h-3.5" />Rendered</button>
                <div className="tool-sep" />
                <button className={`tool-btn ${opts.nodeNo ? '!text-blue-700' : ''}`} title="Node numbers" onClick={() => o('nodeNo')(!opts.nodeNo)}><Hash className="w-3.5 h-3.5" />Nodes</button>
                <button className={`tool-btn ${opts.memberNo ? '!text-blue-700' : ''}`} title="Member numbers" onClick={() => o('memberNo')(!opts.memberNo)}><Hash className="w-3.5 h-3.5" />Members</button>
                <button className={`tool-btn ${opts.secNames ? '!text-blue-700' : ''}`} title="Section names" onClick={() => o('secNames')(!opts.secNames)}><Type className="w-3.5 h-3.5" />Sections</button>
                <button className={`tool-btn ${opts.localAxes ? '!text-blue-700' : ''}`} title="Member local axes: x red, y green, z blue" onClick={() => o('localAxes')(!opts.localAxes)}><Axis3d className="w-3.5 h-3.5" />Axes</button>
                {tab !== 'results' && <button className={`tool-btn ${opts.loads ? '!text-blue-700' : ''}`} title="Loads of the case shown" onClick={() => o('loads')(!opts.loads)}><Weight className="w-3.5 h-3.5" />Loads</button>}
                </div>
              </div>
              <div className="absolute bottom-2 right-3 text-[11px] text-slate-500 pointer-events-none">
                {tool === 'select' ? 'Drag to select (left to right encloses, right to left touches), middle-drag to rotate, right-drag to pan, right-click for options, scroll to zoom' : tool === 'node' ? 'Click on the working plane to place nodes' : 'Click a node or the working plane to start and continue members; Escape to finish'}
              </div>
            </div>
            {tab === 'results' && analysis && <div className="panel flex flex-col lg:h-[42%] lg:min-h-[230px] !space-y-2">
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
      {dialog === 'new' && <TemplateDialog onClose={() => setDialog(null)} onCreate={m => { setModel(() => m); setSel(noSel()); setCaseId(1); setModeIx(null); setDialog(null); setTab('structure'); }} />}
      {dialog === 'section' && <SectionDialog assign={mSel} onClose={() => setDialog(null)} onAdd={(name, p, outline) => {
        setModel(m => {
          const ex = m.sections.find(s => s.name === name), id = ex?.id ?? nextId(m.sections);
          const sections = ex ? m.sections : [...m.sections, { id, name, A: Math.round(p.A), Iy: Math.round(p.Iy), Iz: Math.round(p.Iz), J: Math.round(p.J), outline }];
          return { ...m, sections, members: m.members.map(x => (sel.members.has(x.id) ? { ...x, sec: id } : x)) };
        });
        setDialog(null);
      }} />}
      {dialog === 'report' && <ReportDialog info={info} setInfo={setInfo} onClose={() => setDialog(null)}
        fields={[['project', 'Project'], ['number', 'Project Number'], ['structure', 'Structure'], ['designer', 'Designer'], ['date', 'Date']]}
        onGenerate={async () => { const a = analysis ?? analyse(model); if (a.errors.length) throw new Error(a.errors[0]); const { makeReport } = await import('./report'); await makeReport(model, a, info, viewer.current?.svg() ?? null); }} />}
    </div>
  );
}
