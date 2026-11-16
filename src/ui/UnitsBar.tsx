import { OPTIONS, PRESETS, presetOf, type Units } from '../model/units';

const FIELDS: { key: keyof Units; label: string }[] = [
  { key: 'length', label: 'Length' }, { key: 'force', label: 'Force' }, { key: 'stress', label: 'Stress' }, { key: 'mass', label: 'Mass' }, { key: 'temp', label: 'Temperature' },
];

/** Unit selectors and presets, shown along the bottom of the graphics window. Time is always seconds. */
export function UnitsBar({ units, onChange }: { units: Units; onChange: (u: Units) => void }) {
  const active = presetOf(units);
  return (
    <div data-ui className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 max-w-[calc(100%-16px)] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-white/95 border border-slate-200 rounded-md shadow-2xs px-2 py-1 text-[11px] text-slate-600"
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
      <div className="flex items-center gap-1" role="group" aria-label="Unit presets">
        <span className="font-medium">Units</span>
        {PRESETS.map(p => <button key={p.name} type="button" title={`${p.units.length}, ${p.units.mass}, ${p.units.force}, ${p.units.stress}, ${p.units.temp}, s`}
          className={`btn !h-6 !px-2 !text-[11px] ${active === p.name ? '!bg-blue-50 !border-blue-600 !text-blue-700' : ''}`} onClick={() => onChange(p.units)}>{p.name}</button>)}
      </div>
      {FIELDS.map(f => (
        <label key={f.key} className="flex items-center gap-1">
          <span className="font-medium">{f.label}</span>
          <select className="control !w-auto !h-6 !py-0 !text-[11px]" value={units[f.key]} onChange={e => onChange({ ...units, [f.key]: e.target.value })}>
            {OPTIONS[f.key].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      ))}
      <span className="text-slate-400">Time s</span>
    </div>
  );
}
