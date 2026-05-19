import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import type { ColumnSchema, ConditionalRule, RuleAction, RuleCondition, RuleOperator } from '../../types/index.js';

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: 'eq', label: '==' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' },
];

const ACTIONS: { value: RuleAction; label: string; hasValue: boolean }[] = [
  { value: 'set_null', label: 'Set to NULL', hasValue: false },
  { value: 'set_not_null', label: 'Ensure not null', hasValue: false },
  { value: 'set_value', label: 'Set constant value', hasValue: true },
  { value: 'set_enum', label: 'Pick from list', hasValue: true },
  { value: 'set_range', label: 'Set number range', hasValue: true },
  { value: 'derive_offset', label: 'Derive offset from column', hasValue: true },
  { value: 'derive_compute', label: 'Compute expression', hasValue: true },
];

interface Props {
  columns: ColumnSchema[];
  onSave: (rule: ConditionalRule) => void;
  onClose: () => void;
}

const emptyCondition = (): RuleCondition => ({ column: '', op: 'eq', value: '' });

export function ConditionBuilder({ columns, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([emptyCondition()]);
  const [actionColumn, setActionColumn] = useState(columns[0]?.name ?? '');
  const [action, setAction] = useState<RuleAction>('set_null');
  const [actionValue, setActionValue] = useState('');

  const colNames = columns.map(c => c.name);
  const noValueOps: RuleOperator[] = ['is_null', 'is_not_null'];
  const actionMeta = ACTIONS.find(a => a.value === action)!;

  function updateCond(i: number, patch: Partial<RuleCondition>) {
    setConditions(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  function handleSave() {
    const validConditions = conditions.filter(c => c.column);
    if (validConditions.length === 0 || !actionColumn) return;

    let parsedActionValue: unknown = actionValue;
    if (action === 'set_enum') {
      parsedActionValue = actionValue.split(',').map(s => s.trim()).filter(Boolean);
    } else if (action === 'set_range') {
      const [min, max] = actionValue.split('-').map(Number);
      parsedActionValue = { min: min || 0, max: max || 100 };
    } else if (action === 'derive_offset') {
      const [srcCol, offsetMin, offsetMax, unit = 'days'] = actionValue.split(',').map(s => s.trim());
      parsedActionValue = { sourceColumn: srcCol, offsetMin: Number(offsetMin) || 1, offsetMax: Number(offsetMax) || 30, unit };
    } else if (action === 'derive_compute') {
      parsedActionValue = { expression: actionValue };
    }

    onSave({
      id: nanoid(),
      name: name || `Rule ${new Date().toLocaleTimeString()}`,
      conditions: validConditions,
      actionColumn,
      action,
      actionValue: actionMeta.hasValue ? parsedActionValue : undefined,
    });
  }

  function actionValuePlaceholder(): string {
    switch (action) {
      case 'set_value': return '"cancelled" or 42';
      case 'set_enum': return 'active, inactive, pending';
      case 'set_range': return '0-100';
      case 'derive_offset': return 'start_date, 1, 30, days';
      case 'derive_compute': return 'quantity * unit_price';
      default: return '';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div>
            <h3 className="font-semibold text-sm">Define Workflow Rule</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">Set conditions and resulting actions for data generation.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Rule name */}
          <input
            className="w-full bg-surface border border-outline-variant rounded-md px-3 py-1.5 text-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Rule name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          {/* STEP 1 — Conditions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded px-2 py-0.5 font-semibold">STEP 1</span>
              <span className="text-sm font-medium">Conditions (IF)</span>
            </div>
            <div className="bg-surface border border-outline-variant rounded-lg p-3 space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="space-y-1.5">
                  {i > 0 && (
                    <div className="text-center text-xs text-on-surface-variant font-medium py-1">AND</div>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      value={cond.column}
                      onChange={e => updateCond(i, { column: e.target.value })}
                    >
                      <option value="">— column —</option>
                      {colNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      className="w-28 bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      value={cond.op}
                      onChange={e => updateCond(i, { op: e.target.value as RuleOperator })}
                    >
                      {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {!noValueOps.includes(cond.op) && (
                      <input
                        className="flex-1 bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="value"
                        value={String(cond.value ?? '')}
                        onChange={e => updateCond(i, { value: e.target.value })}
                      />
                    )}
                    <button
                      onClick={() => setConditions(cs => cs.filter((_, idx) => idx !== i))}
                      disabled={conditions.length === 1}
                      className="text-on-surface-variant hover:text-error disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setConditions(cs => [...cs, emptyCondition()])}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <Plus className="w-3 h-3" /> Add Condition
              </button>
            </div>
          </div>

          {/* STEP 2 — Action */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded px-2 py-0.5 font-semibold">STEP 2</span>
              <span className="text-sm font-medium">Action (THEN)</span>
            </div>
            <div className="bg-surface border border-outline-variant rounded-lg p-3 space-y-3">
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={action}
                  onChange={e => setAction(e.target.value as RuleAction)}
                >
                  {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <select
                  className="flex-1 bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={actionColumn}
                  onChange={e => setActionColumn(e.target.value)}
                >
                  {colNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {actionMeta.hasValue && (
                <input
                  className="w-full bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={actionValuePlaceholder()}
                  value={actionValue}
                  onChange={e => setActionValue(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Preview affected columns */}
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Preview — Affected Columns</p>
            <div className="flex gap-2 flex-wrap">
              {conditions.filter(c => c.column).map((c, i) => (
                <div key={i} className="bg-surface-container border border-primary/30 rounded-md px-3 py-2 text-xs">
                  <div className="text-on-surface-variant font-mono mb-0.5">
                    {columns.find(col => col.name === c.column)?.dataType?.toUpperCase() ?? 'COL'}
                  </div>
                  <div className="font-medium">{c.column}</div>
                  <div className="text-green-400 text-xs mt-0.5">CONDITION</div>
                </div>
              ))}
              {actionColumn && (
                <div className="bg-surface-container border border-green-500/30 rounded-md px-3 py-2 text-xs">
                  <div className="text-on-surface-variant font-mono mb-0.5">
                    {columns.find(col => col.name === actionColumn)?.dataType?.toUpperCase() ?? 'COL'}
                  </div>
                  <div className="font-medium">{actionColumn}</div>
                  <div className="text-green-400 text-xs mt-0.5">ACTION TARGET</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm border border-outline-variant rounded-md hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-sm bg-primary text-on-primary-fixed rounded-md hover:bg-primary/90 transition-colors"
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}
