import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sym } from './Sym';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

/** An entry of a right-click menu: an action, an expandable group of actions, or a separator. */
export type MenuItem = { label: string; onClick?: () => void; sub?: MenuItem[]; checked?: boolean; disabled?: boolean; danger?: boolean } | 'sep';

export type MenuState = { x: number; y: number; title: string; items: MenuItem[] };

/** Pop-up menu at the cursor, kept within the drawing. A group opens in a second panel beside the menu (on hover or click). */
export const ContextMenu: React.FC<{ menu: MenuState; W: number; H: number; onClose: () => void }> = ({ menu, W, H, onClose }) => {
  const w = 210;
  const ref = useRef<HTMLDivElement>(null);
  // The open group and the top of its row within the menu (the second panel starts level with it)
  const [open, setOpen] = useState<{ i: number; top: number } | null>(null);
  const [h, setH] = useState(28 + menu.items.length * 28);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  }, [menu]);
  const left = Math.max(8, Math.min(menu.x + 4, W - w - 8));
  const top = Math.max(8, Math.min(menu.y + 4, H - h - 8));
  // The second panel goes to the right of the menu, or to the left where there is no room
  const flyRight = left + 2 * w + 8 <= W;
  const row = (it: Exclude<MenuItem, 'sep'>, key: React.Key, onEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void, onGroup?: (e: React.MouseEvent<HTMLButtonElement>) => void, expanded?: boolean) => (
    <button
      key={key}
      type="button"
      disabled={it.disabled}
      onClick={onGroup ?? it.onClick}
      onMouseEnter={onEnter}
      className={`w-full h-7 pr-3 pl-3 flex items-center gap-2 text-left hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent ${expanded ? 'bg-slate-100' : ''} ${it.danger ? 'text-rose-700' : ''}`}
    >
      <span className="w-3.5 shrink-0 text-blue-600">{it.checked ? <Check className="w-3.5 h-3.5" /> : null}</span>
      <span className="flex-1">{typeof it.label === 'string' ? sym(it.label) : it.label}</span>
      {it.sub && <ChevronRight className="w-3 h-3 text-slate-400" />}
    </button>
  );
  const rowTop = (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.offsetTop - (ref.current?.scrollTop ?? 0);
  const group = open !== null ? menu.items[open.i] : null;
  const subs = group && group !== 'sep' ? group.sub : undefined;
  const subH = subs ? 8 + subs.reduce((a, c) => a + (c === 'sep' ? 9 : 28), 0) : 0;
  const subTop = open ? Math.max(8 - top, Math.min(open.top, H - 8 - top - subH)) : 0;
  return (
    <div
      data-ui
      className="absolute z-20"
      style={{ left, top, width: w }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => (e.preventDefault(), onClose())}
    >
      <div ref={ref} className="relative bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-700 max-h-[calc(100%-16px)] overflow-y-auto scroll-thin">
        {menu.title && <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100 mb-1">{menu.title}</div>}
        {menu.items.map((it, i) =>
          it === 'sep' ? (
            <div key={i} className="my-1 border-t border-slate-100" />
          ) : it.sub ? (
            row(it, i, (e) => setOpen({ i, top: rowTop(e) }), (e) => setOpen(open?.i === i ? null : { i, top: rowTop(e) }), open?.i === i)
          ) : (
            row(it, i, () => setOpen(null))
          )
        )}
      </div>
      {subs && (
        <div
          className="absolute bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-700"
          style={{ top: subTop, width: w, ...(flyRight ? { left: w - 2 } : { right: w - 2 }) }}
        >
          {subs.map((c, j) => (c === 'sep' ? <div key={j} className="my-1 border-t border-slate-100" /> : row(c, j)))}
        </div>
      )}
    </div>
  );
};

export type PromptState = {
  x: number;
  y: number;
  title: string;
  fields: { label: React.ReactNode; value: number }[];
  onSubmit: (values: number[]) => void;
};

/** Small numeric form shown at the cursor for the menu actions that need values (an offset, a size). */
export const PromptBox: React.FC<{ prompt: PromptState; W: number; H: number; onClose: () => void }> = ({ prompt, W, H, onClose }) => {
  const [vals, setVals] = useState(prompt.fields.map((f) => String(f.value)));
  const first = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // The measured height keeps the whole box, buttons included, inside the drawing
  const [h, setH] = useState(60 + prompt.fields.length * 58);
  useLayoutEffect(() => {
    first.current?.focus();
    first.current?.select();
    if (box.current) setH(box.current.offsetHeight);
  }, []);
  const w = 200;
  const left = Math.max(8, Math.min(prompt.x + 4, W - w - 8));
  const top = Math.max(8, Math.min(prompt.y + 4, H - h - 8));
  const nums = vals.map((v) => Number(v.replace(',', '.')));
  const ok = nums.every((n) => Number.isFinite(n));
  const submit = () => {
    if (!ok) return;
    prompt.onSubmit(nums);
    onClose();
  };
  return (
    <div
      ref={box}
      data-ui
      className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 text-xs text-slate-700 space-y-2"
      style={{ left, top, width: w }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => (e.preventDefault(), onClose())}
    >
      <div className="text-[11px] font-semibold text-slate-500">{prompt.title}</div>
      {prompt.fields.map((f, i) => (
        <label key={i} className="block">
          <span className="label">{f.label}</span>
          <input
            ref={i === 0 ? first : undefined}
            type="text"
            inputMode="decimal"
            className="control-sm w-full tabular-nums select-text"
            value={vals[i]}
            onChange={(e) => setVals(vals.map((v, k) => (k === i ? e.target.value : v)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onClose();
              e.stopPropagation();
            }}
          />
        </label>
      ))}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={!ok} onClick={submit}>
          OK
        </button>
      </div>
    </div>
  );
};

/** Toolbar button that opens a group of buttons in a second panel beside the toolbar. A click opens it and it stays open, whatever the cursor does,
 *  until the button is clicked again, a choice is made, or the user clicks elsewhere or presses Esc. */
export function ToolFlyout({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button className={`tool-btn ${open ? '!bg-slate-100' : ''}`} onClick={() => setOpen((o) => !o)}>{icon}{label}<ChevronLeft className="w-3 h-3 ml-auto text-slate-400" /></button>
      {open && <div className="absolute right-full top-0 pr-1 z-20"><div className="toolbar w-[100px]" onClick={() => setOpen(false)}>{children}</div></div>}
    </div>
  );
}

export type TextPromptState = { x: number; y: number; title: string; text: string; onSubmit: (text: string) => void };

/** Small text form at the cursor, for a note: Ctrl+Enter or OK keeps it, Esc cancels. */
export const TextPromptBox: React.FC<{ prompt: TextPromptState; W: number; H: number; onClose: () => void }> = ({ prompt, W, H, onClose }) => {
  const [text, setText] = useState(prompt.text);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { area.current?.focus(); area.current?.select(); }, []);
  const w = 240, left = Math.max(8, Math.min(prompt.x + 4, W - w - 8)), top = Math.max(8, Math.min(prompt.y + 4, H - 170));
  const submit = () => { prompt.onSubmit(text); onClose(); };
  return (
    <div data-ui className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 text-xs text-slate-700 space-y-2" style={{ left, top, width: w }}
      onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div className="text-[11px] font-semibold text-slate-500">{prompt.title}</div>
      <textarea ref={area} rows={4} className="control w-full select-text resize-none" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); if (e.key === 'Escape') onClose(); e.stopPropagation(); }} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={submit}>OK</button>
      </div>
    </div>
  );
};
