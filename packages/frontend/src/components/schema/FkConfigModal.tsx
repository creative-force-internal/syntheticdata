/**
 * FkConfigModal — gear icon modal for advanced FK distribution settings.
 * Opens from SchemaEditor when clicking the ⚙ icon on a foreign_key row.
 */

import { useState } from 'react';
import { X, Info } from 'lucide-react';
import type { ColumnSchema, DatasetSchema } from '../../types/index.js';

interface Props {
  col: ColumnSchema;
  allTables: DatasetSchema[];
  /** Row counts per tableId (from MultiTableGenerate or default 100) */
  rowCounts?: Record<string, number>;
  onSave: (updated: ColumnSchema) => void;
  onClose: () => void;
}

export function FkConfigModal({ col, allTables, rowCounts = {}, onSave, onClose }: Props) {
  const cfg = col.generatorConfig;

  const [dist, setDist] = useState(cfg.fkDistribution ?? 'uniform');
  const [fkNullRate, setFkNullRate] = useState(Math.round((cfg.fkNullRate ?? 0) * 100));
  const [minC, setMinC] = useState(cfg.fkChildrenPerParent?.min ?? 1);
  const [maxC, setMaxC] = useState(cfg.fkChildrenPerParent?.max ?? 5);
  const [fixedValues, setFixedValues] = useState<string>((cfg.fkFixedValues ?? []).join(', '));
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const w of cfg.fkValueWeights ?? []) init[w.value] = w.weight;
    return init;
  });

  // Estimate for fixed_per_parent
  let estimate: number | null = null;
  if (dist === 'fixed_per_parent' && cfg.poolRef) {
    const parentTableName = cfg.poolRef.split('.')[0];
    const parentTable = allTables.find(t => t.name === parentTableName);
    if (parentTable) {
      const parentRows = rowCounts[parentTable.id] ?? 100;
      estimate = Math.round(parentRows * ((minC + maxC) / 2));
    }
  }

  const hasFixedValues = fixedValues.trim().length > 0;

  const parsedFixed = fixedValues.split(',').map(v => v.trim()).filter(Boolean);

  function handleSave() {
    const valueWeights = dist === 'weighted' && parsedFixed.length > 0
      ? parsedFixed.map(v => ({ value: v, weight: weights[v] ?? 1 }))
      : undefined;

    onSave({
      ...col,
      generatorConfig: {
        ...cfg,
        fkDistribution: dist,
        fkNullRate: fkNullRate / 100,
        fkChildrenPerParent: dist === 'fixed_per_parent' ? { min: minC, max: maxC } : undefined,
        fkFixedValues: parsedFixed.length > 0 ? parsedFixed : undefined,
        fkValueWeights: valueWeights,
      },
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div>
            <p className="text-sm font-semibold">FK Distribution Config</p>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">{col.name}</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Distribution mode */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Distribution
            </label>
            <select
              className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={dist}
              onChange={e => setDist(e.target.value as typeof dist)}
            >
              <option value="uniform">Uniform — random pick from pool</option>
              <option value="fixed_per_parent">Fixed per parent — N children each</option>
              <option
                value="weighted"
                disabled={!hasFixedValues}
                title={!hasFixedValues ? 'Requires Fixed Values to be set first' : ''}
              >
                Weighted{!hasFixedValues ? ' (requires Fixed Values)' : ''}
              </option>
            </select>
          </div>

          {/* weighted sub-controls */}
          {dist === 'weighted' && hasFixedValues && (
            <div className="bg-surface-container-high/30 rounded-lg p-4 space-y-2 border border-outline-variant">
              <p className="text-xs font-semibold text-on-surface-variant">Value weights</p>
              {parsedFixed.map(v => (
                <div key={v} className="flex items-center gap-2">
                  <span className="text-xs font-mono flex-1 truncate text-on-surface">{v}</span>
                  <input
                    type="number" min={0.01} step={0.1}
                    className="w-20 bg-surface border border-outline-variant rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
                    value={weights[v] ?? 1}
                    onChange={e => setWeights(prev => ({ ...prev, [v]: Math.max(0.01, Number(e.target.value)) }))}
                  />
                  <span className="text-xs text-on-surface-variant w-10">weight</span>
                </div>
              ))}
              <p className="text-[10px] text-on-surface-variant/60 pt-1">Higher weight = picked more often</p>
            </div>
          )}

          {/* fixed_per_parent sub-controls */}
          {dist === 'fixed_per_parent' && (
            <div className="bg-surface-container-high/30 rounded-lg p-4 space-y-3 border border-outline-variant">
              <p className="text-xs font-semibold text-on-surface-variant">Children per parent</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-on-surface-variant mb-1 block">Min</label>
                  <input
                    type="number" min={0}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={minC}
                    onChange={e => setMinC(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-on-surface-variant mb-1 block">Max</label>
                  <input
                    type="number" min={1}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={maxC}
                    onChange={e => setMaxC(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>
              {estimate !== null && (
                <div className="flex items-start gap-2 text-xs text-blue-400">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Based on parent rows × avg {((minC + maxC) / 2).toFixed(1)} children ≈{' '}
                    <strong className="text-on-surface">{estimate.toLocaleString()} rows</strong> suggested for this table
                  </span>
                </div>
              )}
            </div>
          )}

          {/* FK Null Rate */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Null Rate <span className="font-normal normal-case text-on-surface-variant/60">({fkNullRate}% of FK values will be null)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={5}
                className="flex-1 accent-primary"
                value={fkNullRate}
                onChange={e => setFkNullRate(Number(e.target.value))}
              />
              <input
                type="number" min={0} max={100}
                className="w-16 bg-surface border border-outline-variant rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary"
                value={fkNullRate}
                onChange={e => setFkNullRate(Math.min(100, Math.max(0, Number(e.target.value))))}
              />
              <span className="text-xs text-on-surface-variant">%</span>
            </div>
          </div>

          {/* Fixed values */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
              Fixed Values <span className="font-normal normal-case text-on-surface-variant/60">(comma-separated — restricts pool to this subset)</span>
            </label>
            <textarea
              rows={2}
              className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="e.g. 1, 2, 3  or  active, pending"
              value={fixedValues}
              onChange={e => setFixedValues(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-outline-variant">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm border border-outline-variant hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 rounded-lg text-sm bg-primary text-on-primary-fixed hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
