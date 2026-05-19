import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2, GripVertical, Menu, X } from 'lucide-react';
import type { DatasetSchema } from '../../types/index.js';

interface Props {
  tables: DatasetSchema[];
  activeTableId: string | null;
  onSelectTable: (id: string) => void;
  onAddTable: () => void;
  onDeleteTable: (id: string) => void;
}

export function TableSidebar({
  tables,
  activeTableId,
  onSelectTable,
  onAddTable,
  onDeleteTable,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // Auto-close drawer on route change (e.g. tab switch)
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function handleSelect(id: string) {
    onSelectTable(id);
    setMobileOpen(false);
  }

  return (
    <>
      {/* Mobile toggle — floating top-left, only visible at <md and inside this view */}
      <button
        onClick={() => setMobileOpen(o => !o)}
        className="md:hidden absolute top-2 left-2 z-30 p-1.5 bg-card border border-border rounded-md text-foreground hover:bg-muted shadow"
        aria-label={mobileOpen ? 'Close tables panel' : 'Open tables panel'}
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute inset-0 bg-black/40 z-20"
          aria-hidden="true"
        />
      )}

      <div
        className={`w-56 shrink-0 border-r border-border bg-card/95 md:bg-card/30 backdrop-blur-sm md:backdrop-blur-none flex flex-col absolute md:relative inset-y-0 left-0 z-20 transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="px-3 py-3 border-b border-border pl-12 md:pl-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tables
          </span>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {tables.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 px-3">
              No tables yet. Add one below.
            </p>
          )}

          {tables.map((table) => {
            const isActive = table.id === activeTableId;
            return (
              <div
                key={table.id}
                onClick={() => handleSelect(table.id)}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary border-r-2 border-primary'
                    : 'hover:bg-muted/50 text-foreground'
                }`}
              >
                {/* Drag handle (UX hint only) */}
                <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />

                {/* Name */}
                <span className="flex-1 text-sm font-mono truncate min-w-0">
                  {table.name}
                </span>

                {/* Column count badge */}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {table.columns.length}
                </span>

                {/* Delete button (hover reveal on md+, always visible on mobile) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTable(table.id);
                  }}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 p-0.5 rounded"
                  title="Delete table"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add table button */}
        <div className="p-3 border-t border-border">
          <button
            onClick={onAddTable}
            className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/50 rounded-lg py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Table
          </button>
        </div>
      </div>
    </>
  );
}
