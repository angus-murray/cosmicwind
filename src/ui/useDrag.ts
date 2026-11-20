import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

/** The drawing area (marked `data-canvas` in the Viewer) that floating panels stay inside; the window when there is none. */
const bounds = () => {
  const r = document.querySelector('[data-canvas]')?.getBoundingClientRect();
  return r && r.width > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
};

/**
 * Lets a floating panel be moved by its header, and keeps the whole panel inside the drawing area: when it is opened, while it is dragged
 * and when the window or the area is resized. Returns the panel's position (window coordinates), a ref for the panel and the header's handlers.
 * Buttons and inputs in the header still work, because a drag starts only on the header itself.
 */
export function useDrag(start: { x: number; y: number }) {
  const [pos, setPos] = useState(start);
  const panel = useRef<HTMLDivElement>(null);
  const from = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const fit = (x: number, y: number) => {
    const b = bounds(), w = panel.current?.offsetWidth ?? 0, h = panel.current?.offsetHeight ?? 0;
    return { x: Math.max(b.l + 4, Math.min(x, b.r - w - 4)), y: Math.max(b.t + 4, Math.min(y, b.b - h - 4)) };
  };
  useLayoutEffect(() => { setPos(p => fit(p.x, p.y)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = () => setPos(p => fit(p.x, p.y)); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button, input, select')) return;
      from.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => { const f = from.current; if (f) setPos(fit(f.x + e.clientX - f.px, f.y + e.clientY - f.py)); },
    onPointerUp: (e: PointerEvent<HTMLElement>) => { from.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); },
    style: { cursor: 'move', touchAction: 'none' } as const,
  };
  return { pos, panel, handlers };
}
