import type React from 'react';
import { ChevronDown, Folder, FolderOpen } from 'lucide-react';

type Icon = React.ComponentType<{ className?: string }>;
export interface TreeItem {
  key: string;
  label: string;
  /** An icon like the ones of the toolbar and the dialogs for the same thing. */
  icon: Icon;
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
 * A tree in one panel. A group is a folder that folds; each item in it opens as a drop-down in place, with its content directly beneath it, and thin guide lines mark the levels.
 * Any number of items can be open at once. The classes (`tree-*`) are in `index.css` and use only the house-style tokens, so the dark theme applies.
 */
export function Tree({ groups, open, onToggle, closed, onToggleGroup }: {
  groups: TreeGroup[]; open: Record<string, boolean>; onToggle: (key: string) => void; closed: Record<string, boolean>; onToggleGroup: (key: string) => void;
}) {
  return (
    <section className="panel !space-y-1 lg:flex-1">
      {groups.map(g => {
        const folded = !!closed[g.key], FolderIcon = folded ? Folder : FolderOpen;
        return (
          <div key={g.key}>
            <button type="button" className="tree-group" aria-expanded={!folded} onClick={() => onToggleGroup(g.key)}>
              <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${folded ? '-rotate-90' : ''}`} />
              <FolderIcon className="w-4 h-4 shrink-0 text-slate-500" />{g.title}
            </button>
            {!folded && (
              <div className="tree-children">
                {g.notice}
                {g.items.map(it => {
                  const isOpen = !!open[it.key], Icon = it.icon;
                  return (
                    <div key={it.key}>
                      <button type="button" className={`tree-item ${isOpen ? 'tree-item-open' : it.count === 0 ? 'tree-item-empty' : ''}`} aria-expanded={isOpen} onClick={() => onToggle(it.key)}>
                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'text-blue-700' : 'text-slate-400 -rotate-90'}`} />
                        <Icon className={`w-4 h-4 shrink-0 ${isOpen ? 'text-blue-700' : 'text-slate-500'}`} />
                        <span>{it.label}</span>
                        {it.count !== undefined && <span className={`ml-auto text-xs font-normal tabular-nums ${isOpen ? 'text-blue-700' : 'text-slate-500'}`}>{it.count}</span>}
                      </button>
                      {isOpen && <div className="tree-body">{it.render()}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
