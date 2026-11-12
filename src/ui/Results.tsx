import React, { useState } from 'react';
import { ChartFrame, Dash } from 'engineering-ui';
import type { Model } from '../model/types';
import type { Analysis, CaseResult, MemberResult } from '../solver/frame';
import type { Sel } from './Viewer';

const f = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
type Tab = 'disp' | 'react' | 'forces' | 'member' | 'modes';
const SERIES: { key: keyof MemberResult; label: React.ReactNode; unit: string; colour: string; k?: number }[] = [
  { key: 'N', label: <>Axial <i>N</i></>, unit: 'kN', colour: '#d97706' },
  { key: 'Vy', label: <>Shear <i>V</i><sub>y</sub></>, unit: 'kN', colour: '#059669' },
  { key: 'Mz', label: <>Moment <i>M</i><sub>z</sub></>, unit: 'kNm', colour: '#2563eb' },
  { key: 'dy', label: <>Deflection <i>δ</i><sub>y</sub></>, unit: 'mm', colour: '#c026d3', k: 1000 },
  { key: 'Vz', label: <>Shear <i>V</i><sub>z</sub></>, unit: 'kN', colour: '#059669' },
  { key: 'My', label: <>Moment <i>M</i><sub>y</sub></>, unit: 'kNm', colour: '#2563eb' },
  { key: 'dz', label: <>Deflection <i>δ</i><sub>z</sub></>, unit: 'mm', colour: '#c026d3', k: 1000 },
  { key: 'T', label: <>Torsion <i>T</i></>, unit: 'kNm', colour: '#c026d3' },
];

function Plot({ r, s }: { r: MemberResult; s: (typeof SERIES)[number] }) {
  const ys = (r[s.key] as number[]).map(v => v * (s.k ?? 1)), lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), span = hi - lo || 1;
  const imax = ys.reduce((b, v, i) => (Math.abs(v) > Math.abs(ys[b]) ? i : b), 0);
  return (
    <ChartFrame minHeight={96} maxHeight={120} title={<span className="text-[11px] font-semibold text-slate-700">{s.label} <span className="font-normal text-slate-500">({s.unit}) max {f(hi)}, min {f(lo)}</span></span>}>
      {({ width: w, height: h }) => {
        const X = (x: number) => 6 + (w - 12) * x / r.L, Y = (y: number) => 8 + (h - 16) * (hi - y) / span;
        const line = ys.map((y, i) => `${i ? 'L' : 'M'}${X(r.x[i]).toFixed(1)} ${Y(y).toFixed(1)}`).join('');
        return <svg width={w} height={h} className="block">
          <path d={`${line}L${X(r.L)} ${Y(0)}L${X(0)} ${Y(0)}Z`} fill={s.colour} fillOpacity={0.14} />
          <line x1={X(0)} x2={X(r.L)} y1={Y(0)} y2={Y(0)} stroke="#64748b" strokeWidth={1} />
          <path d={line} fill="none" stroke={s.colour} strokeWidth={1.75} strokeLinejoin="round" />
          <circle cx={X(r.x[imax])} cy={Y(ys[imax])} r={3} fill={s.colour} />
          <text x={X(r.x[imax])} y={Y(ys[imax]) + (ys[imax] >= 0 ? 13 : -6)} fontSize={11} textAnchor={r.x[imax] < r.L / 3 ? 'start' : r.x[imax] > 2 * r.L / 3 ? 'end' : 'middle'} fill="#334155">{f(ys[imax])} at {f(r.x[imax])} m</text>
        </svg>;
      }}
    </ChartFrame>
  );
}

export function ResultTables({ model, analysis, res, sel, onSelect, modeIx, setModeIx }: {
  model: Model; analysis: Analysis; res: CaseResult; sel: Sel; onSelect: (s: Sel) => void;
  modeIx: { kind: 'buckling' | 'modal'; i: number } | null; setModeIx: (m: { kind: 'buckling' | 'modal'; i: number } | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('forces');
  const tabs: [Tab, string][] = [['forces', 'Member Forces'], ['member', 'Member Diagrams'], ['disp', 'Displacements'], ['react', 'Reactions'], ['modes', 'Buckling and Frequencies']];
  const pickN = (id: number) => onSelect({ nodes: new Set([id]), members: new Set() }), pickM = (id: number) => onSelect({ nodes: new Set(), members: new Set([id]) });
  const rowCls = (on: boolean) => `cursor-pointer ${on ? '!bg-blue-50' : ''}`;
  const mm = (a: number[]) => [Math.min(...a), Math.max(...a)];
  const secName = new Map(model.sections.map(s => [s.id, s.name]));
  const selM = [...sel.members][0] ?? model.members[0]?.id, mr = res.members.get(selM);
  const total = [0, 0, 0, 0, 0, 0]; res.reactions.forEach(r => r.forEach((v, i) => { total[i] += v; }));
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex gap-1 flex-wrap pb-2">{tabs.map(([k, l]) => <button key={k} className={`subtab ${tab === k ? 'subtab-active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {tab === 'forces' && <table className="rtable min-w-[860px]">
          <thead className="sticky top-0"><tr><th>Member</th><th>Section</th><th><i>N</i> Min (kN)</th><th><i>N</i> Max (kN)</th><th>|<i>V</i><sub>y</sub>| (kN)</th><th>|<i>V</i><sub>z</sub>| (kN)</th><th>|<i>T</i>| (kNm)</th>
            <th><i>M</i><sub>z</sub> Min (kNm)</th><th><i>M</i><sub>z</sub> Max (kNm)</th><th><i>M</i><sub>y</sub> Min (kNm)</th><th><i>M</i><sub>y</sub> Max (kNm)</th></tr></thead>
          <tbody>{model.members.map(m => {
            const r = res.members.get(m.id); if (!r) return null;
            const abs = (a: number[]) => Math.max(...a.map(Math.abs));
            return <tr key={m.id} className={rowCls(sel.members.has(m.id))} onClick={() => pickM(m.id)}>
              <td>{m.id}{!r.active && ' (inactive)'}</td><td className="truncate">{secName.get(m.sec)}</td><td>{f(mm(r.N)[0])}</td><td>{f(mm(r.N)[1])}</td><td>{f(abs(r.Vy))}</td><td>{f(abs(r.Vz))}</td><td>{f(abs(r.T))}</td>
              <td>{f(mm(r.Mz)[0])}</td><td>{f(mm(r.Mz)[1])}</td><td>{f(mm(r.My)[0])}</td><td>{f(mm(r.My)[1])}</td></tr>;
          })}</tbody>
        </table>}
        {tab === 'member' && (mr ? <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">Member
            <select className="control-sm w-24" value={selM} onChange={e => pickM(Number(e.target.value))}>{model.members.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</select>
            <span className="text-slate-500 font-normal">{secName.get(model.members.find(m => m.id === selM)?.sec ?? -1)}, length {f(mr.L, 3)} m; local axes, distance from end A</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-2">
            {SERIES.filter((s, i) => i < 4 || (mr[s.key] as number[]).some(v => Math.abs(v) > 1e-9)).map(s => <Plot key={s.key} r={mr} s={s} />)}
          </div>
          <table className="rtable min-w-[760px]">
            <thead><tr><th><i>x</i> (m)</th><th><i>N</i> (kN)</th><th><i>V</i><sub>y</sub> (kN)</th><th><i>V</i><sub>z</sub> (kN)</th><th><i>T</i> (kNm)</th><th><i>M</i><sub>y</sub> (kNm)</th><th><i>M</i><sub>z</sub> (kNm)</th><th><i>δ</i><sub>x</sub> (mm)</th><th><i>δ</i><sub>y</sub> (mm)</th><th><i>δ</i><sub>z</sub> (mm)</th></tr></thead>
            <tbody>{mr.x.map((x, i) => <tr key={i}><td>{f(x, 3)}</td><td>{f(mr.N[i])}</td><td>{f(mr.Vy[i])}</td><td>{f(mr.Vz[i])}</td><td>{f(mr.T[i])}</td><td>{f(mr.My[i])}</td><td>{f(mr.Mz[i])}</td>
              <td>{f(mr.dx[i] * 1000, 3)}</td><td>{f(mr.dy[i] * 1000, 3)}</td><td>{f(mr.dz[i] * 1000, 3)}</td></tr>)}</tbody>
          </table>
        </div> : <p className="text-xs text-slate-500">Select a member.</p>)}
        {tab === 'disp' && <table className="rtable min-w-[640px]">
          <thead className="sticky top-0"><tr><th>Node</th><th>DX (mm)</th><th>DY (mm)</th><th>DZ (mm)</th><th>RX (mrad)</th><th>RY (mrad)</th><th>RZ (mrad)</th></tr></thead>
          <tbody>{model.nodes.map(n => { const d = res.disp.get(n.id); return d && <tr key={n.id} className={rowCls(sel.nodes.has(n.id))} onClick={() => pickN(n.id)}><td>{n.id}</td>{d.map((v, i) => <td key={i}>{f(v * 1000, 3)}</td>)}</tr>; })}</tbody>
        </table>}
        {tab === 'react' && <table className="rtable min-w-[640px]">
          <thead className="sticky top-0"><tr><th>Node</th><th>FX (kN)</th><th>FY (kN)</th><th>FZ (kN)</th><th>MX (kNm)</th><th>MY (kNm)</th><th>MZ (kNm)</th></tr></thead>
          <tbody>{[...res.reactions].map(([id, r]) => <tr key={id} className={rowCls(sel.nodes.has(id))} onClick={() => pickN(id)}><td>{id}</td>{r.map((v, i) => <td key={i}>{f(v)}</td>)}</tr>)}
            <tr className="font-semibold"><td>Sum</td>{total.map((v, i) => <td key={i}>{i < 3 ? f(v) : <Dash />}</td>)}</tr></tbody>
        </table>}
        {tab === 'modes' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([['buckling', 'Elastic Critical Buckling', res.buckling, 'Load Factor'], ['modal', 'Natural Frequencies', analysis.modal, 'Frequency (Hz)']] as const).map(([kind, title, set, head]) => <div key={kind}>
            <h3 className="card-title mb-1">{title}</h3>
            {set?.values.length ? <table className="rtable">
              <thead><tr><th>Mode</th><th>{head}</th>{kind === 'modal' && <th>Period (s)</th>}<th>Shape</th></tr></thead>
              <tbody>{set.values.map((v, i) => { const on = modeIx?.kind === kind && modeIx.i === i; return <tr key={i} className={rowCls(on)} onClick={() => setModeIx(on ? null : { kind, i })}><td>{i + 1}</td><td>{f(v, 3)}</td>{kind === 'modal' && <td>{f(1 / v, 4)}</td>}<td>{on ? 'Shown' : 'Show'}</td></tr>; })}</tbody>
            </table> : <p className="text-xs text-slate-500">{kind === 'buckling' ? 'Not calculated. Set the number of buckling modes; the case must put at least one member in compression.' : 'Not calculated. Set the number of vibration modes.'}</p>}
          </div>)}
        </div>}
      </div>
    </div>
  );
}
