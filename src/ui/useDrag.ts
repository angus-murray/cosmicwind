import { useRef, useState, type PointerEvent } from 'react';

/**
 * Lets a floating panel be moved by its header: returns the panel's position and the pointer handlers for the header.
 * The panel is kept inside the window. Buttons and inputs in the header still work, because a drag starts only on the header itself.
 */
export function useDrag(start: { x: number; y: number }) {
  const [pos, setPos] = useState(start);
  const from = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button, input, select')) return;
      from.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const f = from.current; if (!f) return;
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 60, f.x + e.clientX - f.px)), y: Math.max(0, Math.min(window.innerHeight - 30, f.y + e.clientY - f.py)) });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => { from.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); },
    style: { cursor: 'move', touchAction: 'none' } as const,
  };
  return { pos, handlers };
}
