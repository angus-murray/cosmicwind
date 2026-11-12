import { useEffect, useState } from 'react';

/** Swatches offered for a colour: the ten colours given to sections automatically, then six more, each clearly different from all the others. */
export const SWATCHES = [
  '#7c3aed', '#0d9488', '#ea580c', '#db2777', '#0284c7', '#ca8a04', '#4f46e5', '#0891b2', '#c026d3', '#64748b',
  '#0f172a', '#7f1d1d', '#14532d', '#312e81', '#86198f', '#a16207',
];
const HEX = /^#[0-9a-f]{6}$/i;

/** Popover to choose a colour from the swatches, with the system colour picker, a hex field and a way back to the automatic colour. */
export function ColourPicker({ value, auto, at, onChange, onClose }: { value: string; auto: boolean; at: { x: number; y: number }; onChange: (hex: string | null) => void; onClose: () => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const left = Math.max(8, Math.min(at.x, window.innerWidth - 236)), top = Math.min(at.y, window.innerHeight - 250);
  const commit = () => { if (HEX.test(hex)) onChange(hex.toLowerCase()); else setHex(value); };
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div className="absolute w-[224px] bg-white border border-slate-200 rounded-lg shadow-lg p-3 space-y-2.5" style={{ left, top }} onMouseDown={e => e.stopPropagation()}>
        <div className="grid grid-cols-8 gap-1.5">
          {SWATCHES.map(c => <button key={c} title={c} className={`h-6 rounded border ${c.toLowerCase() === value.toLowerCase() && !auto ? 'ring-2 ring-offset-1 ring-blue-600 border-white' : 'border-slate-200'}`} style={{ background: c }} onClick={() => { onChange(c); onClose(); }} />)}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" className="w-8 h-7 p-0 border border-slate-300 rounded cursor-pointer bg-white" value={HEX.test(value) ? value : '#000000'} onChange={e => onChange(e.target.value)} title="Choose any colour" />
          <input className="control-sm w-24 tabular-nums" value={hex} spellCheck={false} autoComplete="off" onChange={e => setHex(e.target.value)} onFocus={e => e.target.select()} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLElement).blur(); } }} />
          <button className="btn !h-7 !px-2 !text-[11px] ml-auto" disabled={auto} title="Use the colour chosen from the section number" onClick={() => { onChange(null); onClose(); }}>Automatic</button>
        </div>
      </div>
    </div>
  );
}
