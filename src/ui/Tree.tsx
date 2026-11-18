import type React from 'react';
import { ChevronDown } from 'lucide-react';

export interface TreeItem {
  key: string;
  label: string;
  /** Number of rows in the datasheet, shown at the right; omit for an item without rows. */
  count?: number;
  /** The content that drops down under the item. It is only called while the item is open. */
  render: () => React.ReactNode;
}
export interface TreeGroup {
  key: string;
  title: string;
  items: TreeItem[];
  /** Shown under the title of the group while it is open, above its items (a banner, for example). */
  notice?: React.ReactNode;
}

/**
 * A tree of panels. Each group is a panel whose title folds it; each item in a group opens as a drop-down in place, with its content directly beneath it.
 * Any number of items can be open at once. The classes (`tree-*`) are in `index.css` and use only the house-style tokens, so the dark theme applies.
 */
export function Tree({ groups, open, onToggle, closed, onToggleGroup }: {
  groups: TreeGroup[]; open: Record<string, boolean>; onToggle: (key: string) => void; closed: Record<string, boolean>; onToggleGroup: (key: string) => void;
}) {
  return (
    <>
      {groups.map(g => {
        const folded = !!closed[g.key];
        return (
          <section key={g.key} className="panel">
            <button type="button" className="tree-title" aria-expanded={!folded} onClick={() => onToggleGroup(g.key)}>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${folded ? '-rotate-90' : ''}`} />{g.title}
            </button>
            {!folded && g.notice}
            {!folded && <div className="space-y-0.5">
              {g.items.map(it => {
                const isOpen = !!open[it.key];
                return (
                  <div key={it.key}>
                    <button type="button" className={`tree-item ${isOpen ? 'tree-item-open' : it.count === 0 ? 'tree-item-empty' : ''}`} aria-expanded={isOpen} onClick={() => onToggle(it.key)}>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      <span>{it.label}</span>
                      {it.count !== undefined && <span className={`ml-auto text-[11px] tabular-nums ${isOpen ? 'text-blue-700' : 'text-slate-500'}`}>{it.count}</span>}
                    </button>
                    {isOpen && <div className="tree-body">{it.render()}</div>}
                  </div>
                );
              })}
            </div>}
          </section>
        );
      })}
    </>
  );
}
