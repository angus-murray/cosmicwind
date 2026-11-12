import React, { useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { DofEditor, type DofSpec } from './DofEditor';
import { sym } from './Sym';
import { ColourPicker } from './ColourPicker';

export interface Col<T> {
  key: string; label: React.ReactNode; w?: number; title?: string;
  type?: 'num' | 'text' | 'select' | 'ro' | 'dof' | 'colour';
  /** For a 'dof' column: the popover that sets each degree of freedom to F, R or S. */
  dof?: DofSpec<T>;
  options?: { value: string; label: string }[];
  /** For a 'colour' column: whether the row is using its automatic colour. */
  autoColour?: (row: T) => boolean;
  /** Options that depend on the row (for example x y z for a local axis and X Y Z for a global one); replaces options. */
  optionsFor?: (row: T) => { value: string; label: string }[];
  /** Suggestions for a text cell. */
  list?: string[];
  get?: (row: T) => string | number;
  set?: (row: T, v: string | number) => T;
}

const show = (v: unknown) => (typeof v === 'number' ? String(Math.abs(v) >= 1e7 || (v !== 0 && Math.abs(v) < 1e-4) ? Number(v.toPrecision(6)) : Number(v.toPrecision(10))) : String(v ?? ''));
const parseNum = (s: string) => { const v = Number(s.trim().replace('−', '-').replace(/,/g, '')); return s.trim() === '' || !isFinite(v) ? null : v; };

/** Editable datasheet. Cells commit on Enter or blur; a block copied from a spreadsheet can be pasted in. */
export function Sheet<T extends object>({ rows, cols, onChange, newRow, selected, onSelect, onDelete, rowLabel, empty }: {
  rows: T[]; cols: Col<T>[]; onChange: (rows: T[]) => void; newRow?: () => T;
  selected?: (row: T) => boolean; onSelect?: (row: T, additive: boolean) => void; onDelete?: (row: T, i: number) => void;
  rowLabel?: (row: T, i: number) => React.ReactNode; empty?: string;
}) {
  const ref = useRef<HTMLTableElement>(null);
  const [pop, setPop] = useState<{ i: number; j: number; x: number; y: number } | null>(null);
  const [cpop, setCpop] = useState<{ i: number; j: number; x: number; y: number } | null>(null);
  const val = (r: T, c: Col<T>) => (c.get ? c.get(r) : (r as Record<string, unknown>)[c.key]) as string | number;
  const apply = (r: T, c: Col<T>, raw: string): T | null => {
    let v: string | number = raw;
    if (c.type === 'ro') return null;
    if (c.type === 'num' || c.type === undefined) { const n = parseNum(raw); if (n === null) return null; v = n; }
    return c.set ? c.set(r, v) : { ...r, [c.key]: v };
  };
  const commit = (i: number, c: Col<T>, raw: string) => {
    if (raw === show(val(rows[i], c))) return;
    const r = apply(rows[i], c, raw);
    if (r) onChange(rows.map((x, k) => (k === i ? r : x)));
  };
  const focus = (i: number, j: number) => (ref.current?.querySelector(`[data-c="${i}-${j}"]`) as HTMLElement | null)?.focus();
  const paste = (e: React.ClipboardEvent, i: number, j: number) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const out = rows.slice();
    text.replace(/\r/g, '').split('\n').filter((l, k, a) => l !== '' || k < a.length - 1).forEach((line, di) => {
      if (i + di >= out.length) { if (!newRow) return; out.push(newRow()); }
      line.split('\t').forEach((cell, dj) => { const c = cols[j + dj]; if (!c) return; const r = apply(out[i + di], c, cell); if (r) out[i + di] = r; });
    });
    onChange(out);
  };
  return (
    <div className="space-y-1.5">
      <div className="overflow-auto max-h-[calc(100vh-250px)] scroll-thin border border-slate-200 rounded">
        <table className="sheet" ref={ref}>
          <thead><tr><th style={{ width: 34 }}></th>{cols.map(c => <th key={c.key} title={c.title} style={{ minWidth: c.w ?? 56 }}>{typeof c.label === 'string' ? sym(c.label) : c.label}</th>)}<th style={{ width: 22 }}></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={selected?.(r) ? 'sel' : ''}>
                <td className="rowhead" onClick={e => onSelect?.(r, e.shiftKey || e.ctrlKey || e.metaKey)}>{rowLabel ? rowLabel(r, i) : i + 1}</td>
                {cols.map((c, j) => {
                  const v = show(val(r, c));
                  return (
                    <td key={c.key}>
                      {c.type === 'select' ? (
                        <select data-c={`${i}-${j}`} value={v} onChange={e => commit(i, c, e.target.value)}>
                          {(() => { const os = c.optionsFor ? c.optionsFor(r) : c.options!; return <>{!os.some(o => o.value === v) && <option value={v}>{v}</option>}{os.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</>; })()}
                        </select>
                      ) : c.type === 'colour' ? (
                        <button data-c={`${i}-${j}`} className="w-full h-6 flex items-center justify-center hover:bg-slate-50" title={c.title}
                          onClick={e => { const b = e.currentTarget.getBoundingClientRect(); setCpop({ i, j, x: b.left, y: b.bottom + 4 }); }}
                          onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focus(i + (e.key === 'ArrowDown' ? 1 : -1), j); } }}>
                          <span className="inline-block w-4 h-4 rounded-[3px] border border-slate-300" style={{ background: String(v) }} />
                        </button>
                      ) : c.type === 'dof' ? (
                        <button data-c={`${i}-${j}`} className="w-full h-6 flex items-center justify-center gap-1 tabular-nums hover:bg-slate-50" title={c.title}
                          onClick={e => { const b = e.currentTarget.getBoundingClientRect(); setPop({ i, j, x: b.left, y: b.bottom + 4 }); }}
                          onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focus(i + (e.key === 'ArrowDown' ? 1 : -1), j); } }}>
                          {v}<ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>
                      ) : (
                        <input data-c={`${i}-${j}`} key={v} defaultValue={v} readOnly={c.type === 'ro'} spellCheck={false} autoComplete="off" list={c.list ? `dl-${c.key}` : undefined}
                          className={c.type === 'ro' ? 'text-slate-500' : ''}
                          onFocus={e => e.target.select()} onBlur={e => commit(i, c, e.target.value)} onPaste={e => paste(e, i, j)}
                          onKeyDown={e => {
                            const t = e.currentTarget;
                            if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); commit(i, c, t.value); setTimeout(() => focus(i + 1, j)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); commit(i, c, t.value); setTimeout(() => focus(i - 1, j)); }
                            else if (e.key === 'Escape') { t.value = v; t.blur(); }
                          }} />
                      )}
                    </td>
                  );
                })}
                <td><button className="w-full h-6 flex items-center justify-center text-slate-400 hover:text-rose-600" title="Delete Row" onClick={() => (onDelete ? onDelete(r, i) : onChange(rows.filter((_, k) => k !== i)))}><X className="w-3 h-3" /></button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols.length + 2} className="!p-2 text-center text-[11px] text-slate-400">{empty ?? 'No rows'}</td></tr>}
          </tbody>
        </table>
      </div>
      {pop && cols[pop.j]?.dof && rows[pop.i] && <DofEditor spec={cols[pop.j].dof!} row={rows[pop.i]} at={pop} onClose={() => setPop(null)}
        onChange={r => onChange(rows.map((x, k) => (k === pop.i ? r : x)))} />}
      {cpop && cols[cpop.j]?.type === 'colour' && rows[cpop.i] && (() => {
        const c = cols[cpop.j], row = rows[cpop.i], cur = String(val(row, c));
        return <ColourPicker value={cur} auto={!!(c.autoColour?.(row))} at={cpop} title={c.title ?? 'Colour'} onClose={() => setCpop(null)} onChange={h => { const r = c.set ? c.set(row, h ?? '') : row; onChange(rows.map((x, k) => (k === cpop.i ? r : x))); }} />;
      })()}
      {cols.filter(c => c.list).map(c => <datalist key={c.key} id={`dl-${c.key}`}>{c.list!.map(o => <option key={o} value={o} />)}</datalist>)}
      {newRow && <button className="btn" onClick={() => onChange([...rows, newRow()])}><Plus className="w-3.5 h-3.5" /> Add Row</button>}
    </div>
  );
}
