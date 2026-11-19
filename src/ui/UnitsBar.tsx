import { useEffect, useRef, useState } from 'react';
import { OPTIONS, PRESETS, presetOf, type Units } from '../model/units';

/** The temperature units as shown: Celsius with its degree sign. */
const TEMP = { C: '°C', K: 'K' } as const;
const FIELDS: { key: keyof Units; label: string }[] = [
  { key: 'length', label: 'Length' }, { key: 'force', label: 'Force' }, { key: 'mass', label: 'Mass' }, { key: 'stress', label: 'Stress' }, { key: 'temp', label: 'Temperature' },
];

/** The units in use, as a small bar at the bottom right of the graphics window. Clicking it opens a menu with the presets and a selector for each unit. Time is always seconds. */
export function UnitsBar({ units, onChange }: { units: Units; onChange: (u: Units) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const active = presetOf(units);
  const shown = [units.length, units.force, units.mass, units.stress, TEMP[units.temp]];
  return (
    <div ref={box} data-ui className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1 max-h-[calc(100%-16px)]" onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
      {open && (
        <div className="w-[210px] min-h-0 overflow-y-auto scroll-thin bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 text-xs text-slate-700 space-y-1.5" role="dialog" aria-label="Units">
          <div className="text-[11px] font-semibold text-slate-500">Presets</div>
          <div className="flex gap-1" role="group" aria-label="Unit presets">
            {PRESETS.map(p => <button key={p.name} type="button" title={`${p.units.length}, ${p.units.force}, ${p.units.mass}, ${p.units.stress}, ${TEMP[p.units.temp]}`}
              className={`btn flex-1 !h-6 !px-1 !text-[11px] ${active === p.name ? '!bg-blue-50 !border-blue-600 !text-blue-700' : ''}`} onClick={() => onChange(p.units)}>{p.name}</button>)}
          </div>
          {FIELDS.map(f => (
            <label key={f.key} className="flex items-center justify-between gap-2">
              <span>{f.label}</span>
              <select className="control !w-24 !h-6 !py-0 !text-[11px]" value={units[f.key]} onChange={e => onChange({ ...units, [f.key]: e.target.value })}>
                {OPTIONS[f.key].map(o => <option key={o} value={o}>{f.key === 'temp' ? TEMP[o as 'C' | 'K'] : o}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      <button type="button" title="Units: click to change" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={`flex items-stretch bg-white/95 border rounded-md shadow-2xs text-[11px] text-slate-700 divide-x divide-slate-200 overflow-hidden hover:bg-slate-50 ${open ? 'border-blue-600' : 'border-slate-300'}`}>
        {shown.map((s, i) => <span key={i} className="px-2.5 py-1 min-w-8 text-center">{s}</span>)}
      </button>
    </div>
  );
}
