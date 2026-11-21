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
  /** A group with no folder of its own: a title row (with `badge` at its right) above the items, for a tab that is the folder. */
  flat?: boolean;
  /** With `flat`: no title row, because the tab already carries the name. */
  bare?: boolean;
  badge?: React.ReactNode;
}
export interface TreeTab { key: string; label: string; icon: Icon }

/**
 * A tree in one panel. A group is a folder that folds; each item in it opens as a drop-down in place, with its content directly beneath it, and thin guide lines mark the levels.
 * Any number of items can be open at once. The classes (`tree-*`) are in `index.css` and use only the house-style tokens, so the dark theme applies.
 */
export function Tree({ groups, open, onToggle, closed, onToggleGroup, tabs, tab, onTab }: {
  groups: TreeGroup[]; open: Record<string, boolean>; onToggle: (key: string) => void; closed?: Record<string, boolean>; onToggleGroup?: (key: string) => void;
  /** Tabs along the top of the panel (the groups shown are those of the active tab). */
  tabs?: TreeTab[]; tab?: string; onTab?: (key: string) => void;
}) {
  const items = (g: TreeGroup) => g.items.map(it => {
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
  });
  const panel = (
    <section className={`panel !space-y-1 lg:flex-1 ${tabs ? '!border-t-0 !rounded-t-none !pt-1' : ''}`}>
      {groups.map(g => {
        if (g.flat) return (
          <div key={g.key} className="space-y-1 pt-2 first:pt-0">
            {!g.bare && <div className="flex flex-wrap items-center justify-between gap-2 min-h-8 px-1 pb-1.5 border-b border-slate-100"><span className="text-sm font-bold text-slate-800">{g.title}</span>{g.badge}</div>}
            {g.notice}
            <div className="space-y-0.5">{items(g)}</div>
          </div>
        );
        const folded = !!closed?.[g.key], FolderIcon = folded ? Folder : FolderOpen;
        return (
          <div key={g.key}>
            <button type="button" className="tree-group" aria-expanded={!folded} onClick={() => onToggleGroup?.(g.key)}>
              <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${folded ? '-rotate-90' : ''}`} />
              <FolderIcon className="w-4 h-4 shrink-0 text-slate-500" />{g.title}
            </button>
            {!folded && <div className="tree-children">{g.notice}{items(g)}</div>}
          </div>
        );
      })}
    </section>
  );
  if (!tabs) return panel;
  return (
    <div className="lg:flex-1 flex flex-col">
      {/* the tabs stay at the top of the scrolling input column */}
      <div className="sticky top-0 z-20 bg-slate-100">
        <div className="flex gap-1 px-2 pt-1" role="tablist">
        {tabs.map(t => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tree-tab ${tab === t.key ? 'tree-tab-active' : ''}`} onClick={() => onTab?.(t.key)}><t.icon className="w-3.5 h-3.5 shrink-0" /><span>{t.label}</span></button>)}
        </div>
        <div className="h-2.5 bg-white border border-b-0 border-slate-200 rounded-t-lg" /> {/* the top of the panel, kept under the tabs when the menu scrolls */}
      </div>
      {panel}
    </div>
  );
}
