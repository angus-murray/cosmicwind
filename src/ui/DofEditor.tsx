import { useEffect, useState } from 'react';
import { sym } from './Sym';

/** What a restraint or release editor needs to know about the six degrees of freedom it edits. */
export interface DofSpec<T> {
  /** Heading of the popover for a row. */
  title: (row: T) => string;
  names: string[];
  /** Unit of the spring stiffness of each degree of freedom. */
  units: string[];
  /** Which degrees of freedom may be springs. */
  spring: boolean[];
  /** Fixed-and-free presets as [code, label]; an en-dash stands for the default. */
  presets: [string, string][];
  /** The code (F, R or S for each degree of freedom, an en-dash for the default) and stiffnesses of a row. */
  code: (row: T) => string;
  stiffness: (row: T) => number[];
  /** The row with a new six-letter code and stiffnesses. */
  apply: (row: T, code: string, k: number[]) => T;
  /** The six-letter code that an en-dash stands for. */
  dflt: string;
}

const NEXT: Record<string, string> = { F: 'R', R: 'S', S: 'F' };
const TINT: Record<string, string> = { F: 'bg-slate-700 text-white', R: 'bg-white text-slate-700 border-slate-300', S: 'bg-amber-100 text-amber-800 border-amber-300' };
const DEFAULT_K = 1000;

/** Popover to set each degree of freedom to F (fixed), R (released) or S (spring) and to give the spring stiffnesses. */
export function DofEditor<T>({ spec, row, at, onChange, onClose }: { spec: DofSpec<T>; row: T; at: { x: number; y: number }; onChange: (r: T) => void; onClose: () => void }) {
  const raw = spec.code(row), six = (raw === '–' || !raw ? spec.dflt : raw).toUpperCase().padEnd(6, spec.dflt[0]).slice(0, 6).split('');
  const k = Array.from({ length: 6 }, (_, i) => spec.stiffness(row)[i] ?? 0);
  const set = (code: string[], kk: number[]) => onChange(spec.apply(row, code.join(''), kk));
  const cycle = (i: number) => {
    let n = NEXT[six[i]]; if (n === 'S' && !spec.spring[i]) n = NEXT.S;
    const code = six.slice(); code[i] = n;
    set(code, n === 'S' && !(k[i] > 0) ? k.map((v, j) => (j === i ? DEFAULT_K : v)) : k);
  };
  const left = Math.max(8, Math.min(at.x, window.innerWidth - 330)), top = Math.min(at.y, window.innerHeight - 330);
  const [draft, setDraft] = useState<Record<number, string>>({});
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const commitK = (i: number) => {
    const t = draft[i]; if (t === undefined) return;
    const v = Number(t.replace('−', '-').replace(/,/g, '')); setDraft(({ [i]: _, ...rest }) => rest);
    if (t.trim() !== '' && isFinite(v) && v >= 0 && v !== k[i]) set(six, k.map((x, j) => (j === i ? v : x)));
  };
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div className="absolute w-[320px] bg-white border border-slate-200 rounded-lg shadow-lg p-3 space-y-2.5" style={{ left, top }} onMouseDown={e => e.stopPropagation()}>
        <div className="text-xs font-semibold text-slate-700">{spec.title(row)}</div>
        <div className="flex flex-wrap gap-1">
          {spec.presets.map(([c, l]) => <button key={c + l} className="btn !h-6 !px-2 !text-[11px]" onClick={() => set((c === '–' ? spec.dflt : c).split(''), k)}><span>{sym(l)}</span></button>)}
        </div>
        <div className="space-y-1.5">
          {six.map((c, i) => (
            <div key={i} className="flex items-center gap-2 h-7">
              <span className="w-8 text-[11px] font-medium text-slate-600">{sym(spec.names[i])}</span>
              <button className={`w-8 h-6 rounded border text-xs font-semibold ${TINT[c] ?? TINT.R}`} title="Click to change: F fixed, R released, S spring" onClick={() => cycle(i)}>{c}</button>
              {c === 'S'
                ? <><input className="control-sm w-24 tabular-nums" inputMode="decimal" autoComplete="off" value={draft[i] ?? String(k[i])} onChange={e => setDraft({ ...draft, [i]: e.target.value })}
                    onFocus={e => e.target.select()} onBlur={() => commitK(i)} onKeyDown={e => { if (e.key === 'Enter') { commitK(i); (e.target as HTMLElement).blur(); } }} />
                  <span className="text-[11px] text-slate-500">{spec.units[i]}</span></>
                : <span className="text-[11px] text-slate-400">{c === 'F' ? 'Fixed' : 'Released'}{!spec.spring[i] ? '' : ''}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
