import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

export interface MenuItem { label?: string; onClick?: () => void; children?: MenuItem[]; danger?: boolean; disabled?: boolean; sep?: boolean; title?: boolean }

/** Right-click menu placed at (x, y) inside the nearest positioned ancestor; submenus open on hover or click. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current, par = el?.offsetParent as HTMLElement | null; if (!el || !par) return;
    setPos({ x: Math.max(4, Math.min(x, par.clientWidth - el.offsetWidth - 4)), y: Math.max(4, Math.min(y, par.clientHeight - el.offsetHeight - 4)) });
  }, [x, y, items]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key); window.addEventListener('wheel', onClose, { passive: true });
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); window.removeEventListener('wheel', onClose); };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute z-30 min-w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-800 select-none" style={{ left: pos.x, top: pos.y }} onContextMenu={e => e.preventDefault()}>
      <Items items={items} onClose={onClose} />
    </div>
  );
}

function Items({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return <>{items.map((it, i) => {
    if (it.sep) return <div key={i} className="my-1 border-t border-slate-200" />;
    if (it.title) return <div key={i} className="px-3 py-1 text-[11px] font-semibold text-slate-500">{it.label}</div>;
    const sub = it.children && it.children.length > 0;
    return <div key={i} className="relative" onMouseEnter={() => setOpen(sub ? i : null)}>
      <button disabled={it.disabled} className={`w-full flex items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent ${it.danger ? 'text-rose-700' : ''}`}
        onClick={() => { if (sub) setOpen(open === i ? null : i); else { it.onClick?.(); onClose(); } }}>
        {it.label}{sub && <ChevronRight className="w-3 h-3 text-slate-400" />}
      </button>
      {sub && open === i && <div className="absolute left-full top-0 -mt-1 ml-0.5 min-w-44 max-h-80 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1"><Items items={it.children!} onClose={onClose} /></div>}
    </div>;
  })}</>;
}
