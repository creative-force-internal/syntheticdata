import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps, OnConnectStart, OnConnectEnd } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { nanoid } from 'nanoid';
import { Plus, Maximize2, Trash2, Check, X, LayoutGrid, Download, Copy, AlertCircle } from 'lucide-react';
import type { ColumnSchema, DatasetSchema, ColumnDataType, IndexType } from '../../types/index.js';
import { useProjectStore } from '../../store/projectStore.js';

// ─── FK validation helpers ────────────────────────────────────────────────────

/** Whether two column data types are valid as parent PK / child FK pair. */
function fkTypesCompatible(a: ColumnDataType, b: ColumnDataType): boolean {
  if (a === b) return true;
  // Common code-first quirk: UUIDs stored as varchar
  if ((a === 'uuid' && b === 'string') || (a === 'string' && b === 'uuid')) return true;
  return false;
}

/**
 * Decode a Connection into PK side and FK side. Supports reverse drag (FK→PK)
 * if a non-PK column was somehow the source. Returns null if the connection
 * isn't a valid FK shape (no PK on either side, or both sides are PK).
 */
function resolveFkSides(
  connection: { sourceHandle?: string | null; targetHandle?: string | null },
  tables: DatasetSchema[],
): {
  pkTable: DatasetSchema; pkCol: ColumnSchema;
  fkTable: DatasetSchema; fkCol: ColumnSchema;
  reason: 'ok';
} | { reason: 'pk-on-pk' | 'no-pk' | 'composite-pk' | 'type-mismatch' | 'self-loop' | 'invalid' } {
  if (!connection.sourceHandle || !connection.targetHandle) return { reason: 'invalid' };
  const [srcTableId, srcColId] = connection.sourceHandle.split('__');
  const [tgtTableId, tgtColId] = connection.targetHandle.split('__');
  if (!srcTableId || !srcColId || !tgtTableId || !tgtColId) return { reason: 'invalid' };
  if (srcTableId === tgtTableId && srcColId === tgtColId)   return { reason: 'self-loop' };

  const srcTable = tables.find(t => t.id === srcTableId);
  const tgtTable = tables.find(t => t.id === tgtTableId);
  if (!srcTable || !tgtTable) return { reason: 'invalid' };
  const srcCol = srcTable.columns.find(c => c.id === srcColId);
  const tgtCol = tgtTable.columns.find(c => c.id === tgtColId);
  if (!srcCol || !tgtCol) return { reason: 'invalid' };

  const srcIsPk = srcCol.indexType === 'primary_key';
  const tgtIsPk = tgtCol.indexType === 'primary_key';
  if (srcIsPk && tgtIsPk) return { reason: 'pk-on-pk' };
  if (!srcIsPk && !tgtIsPk) return { reason: 'no-pk' };

  const pkTable = srcIsPk ? srcTable : tgtTable;
  const pkCol   = srcIsPk ? srcCol   : tgtCol;
  const fkTable = srcIsPk ? tgtTable : srcTable;
  const fkCol   = srcIsPk ? tgtCol   : srcCol;

  const pkCount = pkTable.columns.filter(c => c.indexType === 'primary_key').length;
  if (pkCount > 1) return { reason: 'composite-pk' };
  if (!fkTypesCompatible(pkCol.dataType, fkCol.dataType)) return { reason: 'type-mismatch' };

  return { pkTable, pkCol, fkTable, fkCol, reason: 'ok' };
}

/** Compute the set of valid target handle IDs for a given drag source. */
function computeValidTargets(
  dragSourceHandle: string | null,
  tables: DatasetSchema[],
): Set<string> {
  if (!dragSourceHandle) return new Set();
  const [srcTableId, srcColId] = dragSourceHandle.split('__');
  if (!srcTableId || !srcColId) return new Set();
  const srcTable = tables.find(t => t.id === srcTableId);
  const srcCol = srcTable?.columns.find(c => c.id === srcColId);
  if (!srcTable || !srcCol) return new Set();

  // Only PK→FK direction emits a visible source handle today, so we score
  // potential target handles against the dragged PK column.
  if (srcCol.indexType !== 'primary_key') return new Set();
  const pkCount = srcTable.columns.filter(c => c.indexType === 'primary_key').length;
  if (pkCount > 1) return new Set();  // composite-PK source — skip for v1

  const valid = new Set<string>();
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.indexType === 'primary_key') continue;     // can't drop on a PK
      if (!fkTypesCompatible(srcCol.dataType, c.dataType)) continue;
      valid.add(`${t.id}__${c.id}`);
    }
  }
  return valid;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableNodeData extends Record<string, unknown> {
  table: DatasetSchema;
  onTableClick: () => void;
  /** Set during a drag — the source handle ID (`${tableId}__${colId}`). */
  dragSourceHandle?: string | null;
  /** Set of target handle IDs valid as drop targets for the current drag. */
  validTargets?: Set<string> | null;
}

type TableNodeType = Node<TableNodeData>;
type DiagramEdge = Edge;

// ─── TableNode ────────────────────────────────────────────────────────────────

function TableNode({ data }: NodeProps<TableNodeType>) {
  const { table, onTableClick, dragSourceHandle, validTargets } = data;
  const isDragging = !!dragSourceHandle;

  return (
    <div
      className="bg-card border border-border rounded-lg shadow-lg min-w-[190px] cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onTableClick as React.MouseEventHandler}
    >
      {/* Header */}
      <div className="bg-muted/80 px-3 py-2 border-b border-border rounded-t-lg">
        <span className="text-xs font-semibold font-mono text-foreground">{table.name}</span>
      </div>

      {/* Columns */}
      <div className="py-1">
        {table.columns.map((col) => {
          const isPK = col.indexType === 'primary_key';
          const isFK = col.indexType === 'foreign_key';
          const isUQ = col.indexType === 'unique';
          const handleId = `${table.id}__${col.id}`;
          // During a drag, mark target handles as valid/invalid; outside of a drag, default styling.
          const isValidTarget = isDragging && validTargets?.has(handleId);
          const isInvalidTarget = isDragging && !validTargets?.has(handleId) && handleId !== dragSourceHandle;

          return (
            <div
              key={col.id}
              className="relative flex items-center gap-2 px-3 py-1 hover:bg-muted/30 transition-colors"
            >
              {/* Target handle: all non-PK columns can receive a FK drag */}
              {!isPK && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={handleId}
                  style={{
                    background: isValidTarget ? '#10b981' : isFK ? '#6366f1' : '#475569',
                    width: isValidTarget ? 12 : 8,
                    height: isValidTarget ? 12 : 8,
                    left: isValidTarget ? -6 : -4,
                    opacity: isInvalidTarget ? 0.15 : isValidTarget ? 1 : isFK ? 1 : 0.45,
                    transition: 'opacity 120ms, width 120ms, height 120ms, left 120ms, background 120ms',
                  }}
                />
              )}

              {/* Icon */}
              <span className="text-[11px] shrink-0">
                {isPK ? '🔑' : isFK ? '🔗' : isUQ ? '◇' : '·'}
              </span>

              {/* Column name */}
              <span
                className={`text-xs font-mono truncate flex-1 ${
                  isPK ? 'text-yellow-400 font-semibold' : isFK ? 'text-blue-400' : 'text-foreground'
                }`}
              >
                {col.name}
              </span>

              {/* Data type */}
              <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                {col.dataType}
              </span>

              {/* Source handle: PK columns can be dragged FROM */}
              {isPK && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  style={{ background: '#eab308', width: 12, height: 12, right: -6, cursor: 'crosshair' }}
                />
              )}
            </div>
          );
        })}

        {table.columns.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground italic">No columns</div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { tableNode: TableNode } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Approximate rendered size of a TableNode for dagre. Header is ~36px, each
// column row ~24px, plus a few px of padding. Width roughly matches min-w-[190px]
// plus column-name + type. Disconnected components stack vertically below the
// main hierarchy; dagre positions them automatically given the rankdir.
const NODE_WIDTH = 220;
function nodeHeight(columnCount: number): number {
  return 40 + Math.max(columnCount, 1) * 24 + 8;
}

function layoutWithDagre(
  tables: DatasetSchema[],
  rankdir: 'TB' | 'LR' = 'LR',
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 60, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const table of tables) {
    g.setNode(table.id, { width: NODE_WIDTH, height: nodeHeight(table.columns.length) });
  }
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.indexType !== 'foreign_key' || !col.generatorConfig.poolRef) continue;
      const refTableName = col.generatorConfig.poolRef.split('.')[0];
      const refTable = tables.find((t) => t.name === refTableName);
      if (!refTable || refTable.id === table.id) continue;
      g.setEdge(refTable.id, table.id);
    }
  }

  dagre.layout(g);

  // dagre returns center-points; React Flow uses top-left, so shift by half size.
  const positions = new Map<string, { x: number; y: number }>();
  for (const table of tables) {
    const n = g.node(table.id);
    if (!n) continue;
    positions.set(table.id, {
      x: n.x - NODE_WIDTH / 2,
      y: n.y - nodeHeight(table.columns.length) / 2,
    });
  }
  return positions;
}

function buildNodes(
  tables: DatasetSchema[],
  onTableClick: (tableId: string) => void,
  positions: Map<string, { x: number; y: number }>,
): TableNodeType[] {
  return tables.map((table) => ({
    id: table.id,
    type: 'tableNode' as const,
    position: positions.get(table.id) ?? { x: 0, y: 0 },
    data: {
      table,
      onTableClick: () => onTableClick(table.id),
    },
  }));
}

function buildEdges(tables: DatasetSchema[]): DiagramEdge[] {
  const edges: DiagramEdge[] = [];
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.indexType === 'foreign_key' && col.generatorConfig.poolRef) {
        const [refTableName, refColName] = col.generatorConfig.poolRef.split('.');
        if (!refTableName || !refColName) continue;
        const refTable = tables.find((t) => t.name === refTableName);
        if (!refTable) continue;
        const refCol = refTable.columns.find((c) => c.name === refColName);
        if (!refCol) continue;

        const cfg = col.generatorConfig;
        const edgeLabel =
          cfg.fkDistribution === 'fixed_per_parent' && cfg.fkChildrenPerParent
            ? `×${cfg.fkChildrenPerParent.min}–${cfg.fkChildrenPerParent.max}`
            : 'FK';

        edges.push({
          id: `${table.id}-${col.id}`,
          source: refTable.id,
          sourceHandle: `${refTable.id}__${refCol.id}`,
          target: table.id,
          targetHandle: `${table.id}__${col.id}`,
          animated: true,
          label: edgeLabel,
          style: { stroke: '#6366f1' },
          labelStyle: { fill: '#a5b4fc', fontSize: 10 },
        });
      }
    }
  }
  return edges;
}

// ─── Custom SVG export ────────────────────────────────────────────────────────
// Render the diagram directly from schema data. The visual style is fixed, so
// emitting hand-written SVG is far smaller and cleaner than capturing the live
// DOM with html-to-image (which inlines computed cssText, theme tokens, and
// @font-face data on every element).

const SVG_NODE_WIDTH = 220;
const SVG_HEADER_HEIGHT = 32;
const SVG_ROW_HEIGHT = 24;
const SVG_CARD_RADIUS = 6;
const SVG_NODE_PADDING_Y = 4;
const SVG_EXPORT_PADDING = 40;
const SVG_FONT = "ui-monospace, Menlo, Consolas, 'Courier New', monospace";

function svgTableHeight(columnCount: number): number {
  return SVG_HEADER_HEIGHT + Math.max(columnCount, 1) * SVG_ROW_HEIGHT + SVG_NODE_PADDING_Y * 2;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface BuiltSvg { svg: string; width: number; height: number }

function buildExportSvg(
  tables: DatasetSchema[],
  positions: Map<string, { x: number; y: number }>,
): BuiltSvg {
  // Compute bounds across all tables
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tables) {
    const p = positions.get(t.id) ?? { x: 0, y: 0 };
    const h = svgTableHeight(t.columns.length);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + SVG_NODE_WIDTH > maxX) maxX = p.x + SVG_NODE_WIDTH;
    if (p.y + h > maxY) maxY = p.y + h;
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const width = Math.ceil(maxX - minX + SVG_EXPORT_PADDING * 2);
  const height = Math.ceil(maxY - minY + SVG_EXPORT_PADDING * 2);
  const ox = SVG_EXPORT_PADDING - minX;
  const oy = SVG_EXPORT_PADDING - minY;

  // Per-column row Y center, indexed by `${tableId}__${colId}`
  const colCenter = new Map<string, number>();
  for (const t of tables) {
    const p = positions.get(t.id) ?? { x: 0, y: 0 };
    t.columns.forEach((c, i) => {
      const yCenter = p.y + SVG_HEADER_HEIGHT + SVG_NODE_PADDING_Y + i * SVG_ROW_HEIGHT + SVG_ROW_HEIGHT / 2;
      colCenter.set(`${t.id}__${c.id}`, yCenter);
    });
  }

  // Edges (drawn under nodes)
  const edgeParts: string[] = [];
  for (const t of tables) {
    const p = positions.get(t.id);
    if (!p) continue;
    for (const col of t.columns) {
      if (col.indexType !== 'foreign_key' || !col.generatorConfig.poolRef) continue;
      const [refTableName, refColName] = col.generatorConfig.poolRef.split('.');
      if (!refTableName || !refColName) continue;
      const refTable = tables.find((rt) => rt.name === refTableName);
      if (!refTable) continue;
      const refCol = refTable.columns.find((c) => c.name === refColName);
      if (!refCol) continue;
      const refPos = positions.get(refTable.id);
      if (!refPos) continue;

      const sy = colCenter.get(`${refTable.id}__${refCol.id}`);
      const ty = colCenter.get(`${t.id}__${col.id}`);
      if (sy === undefined || ty === undefined) continue;

      const sx = refPos.x + SVG_NODE_WIDTH + ox;
      const tx = p.x + ox;
      const sY = sy + oy;
      const tY = ty + oy;
      const dx = Math.max(40, Math.abs(tx - sx) / 2);

      edgeParts.push(
        `<path d="M ${sx} ${sY} C ${sx + dx} ${sY} ${tx - dx} ${tY} ${tx} ${tY}" fill="none" stroke="#6366f1" stroke-width="1.5"/>`
      );

      const cfg = col.generatorConfig;
      const edgeLabel =
        cfg.fkDistribution === 'fixed_per_parent' && cfg.fkChildrenPerParent
          ? `×${cfg.fkChildrenPerParent.min}-${cfg.fkChildrenPerParent.max}`
          : 'FK';
      const lx = (sx + tx) / 2;
      const lY = (sY + tY) / 2;
      const labelW = Math.max(20, edgeLabel.length * 6 + 8);
      edgeParts.push(
        `<g transform="translate(${(lx - labelW / 2).toFixed(1)} ${(lY - 8).toFixed(1)})">` +
        `<rect width="${labelW}" height="16" rx="3" fill="#1e293b"/>` +
        `<text x="${labelW / 2}" y="11" text-anchor="middle" fill="#ffffff" font-size="9" font-family="${SVG_FONT}">${escapeXml(edgeLabel)}</text>` +
        `</g>`
      );
    }
  }

  // Nodes (table cards)
  const nodeParts: string[] = [];
  for (const t of tables) {
    const p = positions.get(t.id) ?? { x: 0, y: 0 };
    const x = p.x + ox;
    const y = p.y + oy;
    const h = svgTableHeight(t.columns.length);
    const W = SVG_NODE_WIDTH;
    const R = SVG_CARD_RADIUS;
    const HH = SVG_HEADER_HEIGHT;

    let g = `<g transform="translate(${x} ${y})">`;
    // Card body
    g += `<rect x="0" y="0" width="${W}" height="${h}" rx="${R}" ry="${R}" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>`;
    // Header bar (clipped to top of the rounded card)
    g += `<path d="M 0 ${R} A ${R} ${R} 0 0 1 ${R} 0 L ${W - R} 0 A ${R} ${R} 0 0 1 ${W} ${R} L ${W} ${HH} L 0 ${HH} Z" fill="#f1f5f9"/>`;
    g += `<line x1="0" y1="${HH}" x2="${W}" y2="${HH}" stroke="#e2e8f0"/>`;
    // Table name
    g += `<text x="12" y="${HH / 2 + 4}" font-family="${SVG_FONT}" font-size="11" font-weight="600" fill="#1e293b">${escapeXml(t.name)}</text>`;

    if (t.columns.length === 0) {
      g += `<text x="12" y="${HH + SVG_ROW_HEIGHT / 2 + 4 + SVG_NODE_PADDING_Y}" font-family="${SVG_FONT}" font-size="11" font-style="italic" fill="#94a3b8">No columns</text>`;
    } else {
      t.columns.forEach((c, i) => {
        const cy = HH + SVG_NODE_PADDING_Y + i * SVG_ROW_HEIGHT + SVG_ROW_HEIGHT / 2;
        const isPK = c.indexType === 'primary_key';
        const isFK = c.indexType === 'foreign_key';
        const isUQ = c.indexType === 'unique';

        // Index marker — SVG primitives, no font/emoji dependency
        if (isPK) {
          g += `<circle cx="14" cy="${cy}" r="4" fill="#eab308"/>`;
        } else if (isFK) {
          g += `<circle cx="14" cy="${cy}" r="4" fill="#6366f1"/>`;
        } else if (isUQ) {
          g += `<rect x="10" y="${cy - 4}" width="8" height="8" transform="rotate(45 14 ${cy})" fill="none" stroke="#10b981" stroke-width="1.5"/>`;
        } else {
          g += `<circle cx="14" cy="${cy}" r="1.5" fill="#94a3b8"/>`;
        }

        const nameColor = isPK ? '#a16207' : isFK ? '#4f46e5' : '#1e293b';
        const nameWeight = isPK ? '600' : '400';
        g += `<text x="26" y="${cy + 4}" font-family="${SVG_FONT}" font-size="11" font-weight="${nameWeight}" fill="${nameColor}">${escapeXml(c.name)}</text>`;
        g += `<text x="${W - 12}" y="${cy + 4}" text-anchor="end" font-family="${SVG_FONT}" font-size="9" fill="#64748b">${escapeXml(c.dataType)}</text>`;
      });
    }
    g += `</g>`;
    nodeParts.push(g);
  }

  // width/height = 100% + viewBox makes the SVG fill its viewport (so it
  // centers itself when the file is opened standalone in a browser); the
  // viewBox preserves the diagram's intrinsic aspect ratio. For raster
  // export we swap back to explicit pixel dims (see svgToPngBlob).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    edgeParts.join('') +
    nodeParts.join('') +
    `</svg>`;

  return { svg, width, height };
}

async function svgToPngBlob(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  // Canvas needs explicit intrinsic size to rasterize correctly — replace
  // the percentage dims with pixels before handing the SVG to <img>.
  const pixelSvg = svg.replace(
    'width="100%" height="100%"',
    `width="${width}" height="${height}"`,
  );
  const svgBlob = new Blob([pixelSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image failed to load'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2D context unavailable');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Add-Table inline form ────────────────────────────────────────────────────

type NewCol = { id: string; name: string; dataType: ColumnDataType; indexType: IndexType };

const DATA_TYPES: ColumnDataType[] = ['integer', 'float', 'string', 'boolean', 'date', 'uuid', 'enum'];
const INDEX_TYPES: { value: IndexType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'primary_key', label: 'PK' },
  { value: 'foreign_key', label: 'FK' },
  { value: 'unique', label: 'UQ' },
];

function makeDefaultColumn(indexType: IndexType = 'none'): NewCol {
  return { id: nanoid(), name: '', dataType: 'string', indexType };
}

interface AddTableFormProps {
  onAdd: (table: DatasetSchema) => void;
  onCancel: () => void;
}

function AddTableForm({ onAdd, onCancel }: AddTableFormProps) {
  const [name, setName] = useState('');
  const [cols, setCols] = useState<NewCol[]>([
    { id: nanoid(), name: 'id', dataType: 'integer', indexType: 'primary_key' },
  ]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function addCol() {
    setCols(prev => [...prev, makeDefaultColumn()]);
  }

  function removeCol(id: string) {
    setCols(prev => prev.filter(c => c.id !== id));
  }

  function updateCol(id: string, patch: Partial<NewCol>) {
    setCols(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function handleCreate() {
    const tableName = name.trim() || 'new_table';
    const columns: ColumnSchema[] = cols
      .filter(c => c.name.trim())
      .map(c => ({
        id: nanoid(),
        name: c.name.trim(),
        dataType: c.dataType,
        indexType: c.indexType,
        notNull: c.indexType === 'primary_key',
        generatorConfig: { locale: 'en' },
        poolName: c.indexType === 'primary_key' ? `${tableName}.${c.name.trim()}` : undefined,
      }));

    const table: DatasetSchema = {
      id: nanoid(),
      name: tableName,
      columns,
      rules: [],
      sourceType: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAdd(table);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div
      className="absolute top-3 left-3 z-20 bg-card border border-border rounded-xl shadow-2xl w-80 overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <span className="text-xs font-semibold">New Table</span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Table name */}
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Table name
          </label>
          <input
            ref={nameRef}
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. orders"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Columns
            </label>
            <button
              onClick={addCol}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <Plus className="w-3 h-3" /> Add column
            </button>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {cols.map((col) => (
              <div key={col.id} className="flex items-center gap-1.5">
                {/* Name */}
                <input
                  className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="column_name"
                  value={col.name}
                  onChange={e => updateCol(col.id, { name: e.target.value })}
                />
                {/* Type */}
                <select
                  className="bg-background border border-border rounded-md px-1 py-1 text-xs focus:outline-none w-20"
                  value={col.dataType}
                  onChange={e => updateCol(col.id, { dataType: e.target.value as ColumnDataType })}
                >
                  {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {/* Index */}
                <select
                  className="bg-background border border-border rounded-md px-1 py-1 text-xs focus:outline-none w-14"
                  value={col.indexType}
                  onChange={e => updateCol(col.id, { indexType: e.target.value as IndexType })}
                >
                  {INDEX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {/* Remove */}
                <button
                  onClick={() => removeCol(col.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t border-border">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg text-xs border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() && cols.every(c => !c.name.trim())}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3 h-3" /> Create Table
        </button>
      </div>
    </div>
  );
}

// ─── Inner flow component (needs ReactFlowProvider context) ───────────────────

interface FlowProps {
  tables: DatasetSchema[];
  onTableClick: (tableId: string) => void;
  addTable: (table: DatasetSchema) => void;
  updateTable: (table: DatasetSchema) => void;
}

function DiagramFlow({ tables, onTableClick, addTable, updateTable }: FlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>(
    buildNodes(tables, onTableClick, layoutWithDagre(tables)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>(buildEdges(tables));
  const [showAddForm, setShowAddForm] = useState(false);
  const [copied, setCopied] = useState(false);

  // FK editing state (B1/B2/B3/B4)
  const [dragSourceHandle, setDragSourceHandle] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<DiagramEdge | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    fkTableId: string; fkColId: string; newRef: string; oldRef: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((message: string, tone: 'error' | 'info' = 'info') => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback({ message, tone });
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3500);
  }, []);

  const validTargets = useMemo(
    () => computeValidTargets(dragSourceHandle, tables),
    [dragSourceHandle, tables],
  );

  // Re-layout when the table SET changes (added/removed) but preserve user
  // drags otherwise. We compare the sorted id list to detect set changes.
  const tableIdsKey = tables.map((t) => t.id).sort().join('|');
  useEffect(() => {
    setNodes(buildNodes(tables, onTableClick, layoutWithDagre(tables)));
    setEdges(buildEdges(tables));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableIdsKey]);

  // Refresh edges whenever FK config changes (without re-laying out positions)
  useEffect(() => {
    setEdges(buildEdges(tables));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  // Push drag state into node.data so TableNode can dim invalid handles.
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...n.data, dragSourceHandle, validTargets },
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragSourceHandle, validTargets]);

  function handleAutoArrange() {
    const positions = layoutWithDagre(tables);
    setNodes((nds) =>
      nds.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
    );
  }

  async function handleDownload(format: 'png' | 'svg') {
    if (tables.length === 0) return;

    // Use current node positions so user drags are preserved in the export
    const positions = new Map(nodes.map((n) => [n.id, n.position]));
    const { svg, width, height } = buildExportSvg(tables, positions);

    const blob =
      format === 'svg'
        ? new Blob([svg], { type: 'image/svg+xml' })
        : await svgToPngBlob(svg, width, height, 2);

    const projectName = useProjectStore.getState().project?.name ?? 'diagram';
    const safe = projectName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safe}-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCopyImage() {
    if (tables.length === 0) return;
    const positions = new Map(nodes.map((n) => [n.id, n.position]));
    const { svg, width, height } = buildExportSvg(tables, positions);
    try {
      // Rasterize to PNG — Word/Docs/Slack/Notion all accept image/png from
      // the clipboard. image/svg+xml support is too spotty across paste targets.
      const pngBlob = await svgToPngBlob(svg, width, height, 2);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; surface nothing rather
      // than throwing — the user will retry or use the download button.
    }
  }

  const applyFk = useCallback(
    (fkTable: DatasetSchema, fkCol: ColumnSchema, newRef: string, connection: Connection) => {
      const updatedCol: ColumnSchema = {
        ...fkCol,
        indexType: 'foreign_key',
        generatorConfig: { ...fkCol.generatorConfig, poolRef: newRef },
      };
      updateTable({
        ...fkTable,
        columns: fkTable.columns.map((c) => (c.id === fkCol.id ? updatedCol : c)),
      });
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, label: 'FK', style: { stroke: '#6366f1' }, labelStyle: { fill: '#a5b4fc', fontSize: 10 } },
          eds,
        ),
      );
      showFeedback(`Linked ${fkTable.name}.${fkCol.name} → ${newRef}`);
    },
    [updateTable, setEdges, showFeedback],
  );

  // Predicate used by React Flow during drag to gate which targets accept a drop.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const resolved = resolveFkSides(
        { sourceHandle: connection.sourceHandle ?? null, targetHandle: connection.targetHandle ?? null },
        tables,
      );
      return resolved.reason === 'ok';
    },
    [tables],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const resolved = resolveFkSides(connection, tables);
      switch (resolved.reason) {
        case 'invalid':
        case 'self-loop':
          return;
        case 'pk-on-pk':
          showFeedback('Target is already a PK — drop on a non-PK column', 'error');
          return;
        case 'no-pk':
          showFeedback('FK relationships need a PK column on one side', 'error');
          return;
        case 'composite-pk':
          showFeedback("Composite PKs aren't supported as FK targets yet", 'error');
          return;
        case 'type-mismatch': {
          // Re-decode to surface specific types in the message
          if (!connection.sourceHandle || !connection.targetHandle) return;
          const [stid, scid] = connection.sourceHandle.split('__');
          const [ttid, tcid] = connection.targetHandle.split('__');
          const sc = tables.find(t => t.id === stid)?.columns.find(c => c.id === scid);
          const tc = tables.find(t => t.id === ttid)?.columns.find(c => c.id === tcid);
          showFeedback(`Type mismatch: ${sc?.dataType ?? '?'} → ${tc?.dataType ?? '?'}`, 'error');
          return;
        }
        case 'ok': {
          const { pkTable, pkCol, fkTable, fkCol } = resolved;
          const newRef = `${pkTable.name}.${pkCol.name}`;
          const oldRef = fkCol.indexType === 'foreign_key' ? fkCol.generatorConfig.poolRef : undefined;
          if (oldRef && oldRef !== newRef) {
            setPendingOverwrite({ fkTableId: fkTable.id, fkColId: fkCol.id, newRef, oldRef });
            return;
          }
          if (oldRef === newRef) return;  // already linked, no-op
          applyFk(fkTable, fkCol, newRef, connection);
          return;
        }
      }
    },
    [tables, applyFk, showFeedback],
  );

  const confirmOverwrite = useCallback(() => {
    if (!pendingOverwrite) return;
    const fkTable = tables.find(t => t.id === pendingOverwrite.fkTableId);
    const fkCol   = fkTable?.columns.find(c => c.id === pendingOverwrite.fkColId);
    if (!fkTable || !fkCol) { setPendingOverwrite(null); return; }
    // Synthesize a Connection so applyFk can extend the edge list. The actual
    // source/target handles are reconstructable but the edge will be rebuilt
    // by the buildEdges effect when tables update, so an empty connection works.
    const [parentTable, parentCol] = pendingOverwrite.newRef.split('.');
    const pkTable = tables.find(t => t.name === parentTable);
    const pkCol   = pkTable?.columns.find(c => c.name === parentCol);
    if (!pkTable || !pkCol) { setPendingOverwrite(null); return; }
    const synthetic: Connection = {
      source: pkTable.id,
      sourceHandle: `${pkTable.id}__${pkCol.id}`,
      target: fkTable.id,
      targetHandle: `${fkTable.id}__${fkCol.id}`,
    };
    applyFk(fkTable, fkCol, pendingOverwrite.newRef, synthetic);
    setPendingOverwrite(null);
  }, [pendingOverwrite, tables, applyFk]);

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    setDragSourceHandle(params.handleId || null);
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(() => {
    setDragSourceHandle(null);
  }, []);

  // Remove FK on edge delete (e.g. user pressed Delete key on a selected edge).
  const onEdgesDelete = useCallback((deleted: DiagramEdge[]) => {
    for (const edge of deleted) {
      if (!edge.targetHandle) continue;
      const [tgtTableId, tgtColId] = edge.targetHandle.split('__');
      const tgtTable = tables.find((t) => t.id === tgtTableId);
      const tgtCol   = tgtTable?.columns.find((c) => c.id === tgtColId);
      if (!tgtTable || !tgtCol) continue;
      const newConfig = { ...tgtCol.generatorConfig };
      delete newConfig.poolRef;
      delete newConfig.fkNullRate;
      delete newConfig.fkDistribution;
      delete newConfig.fkChildrenPerParent;
      delete newConfig.fkValueWeights;
      delete newConfig.fkFixedValues;
      updateTable({
        ...tgtTable,
        columns: tgtTable.columns.map((c) =>
          c.id === tgtCol.id ? { ...c, indexType: 'none' as const, generatorConfig: newConfig } : c,
        ),
      });
      showFeedback(`Removed FK on ${tgtTable.name}.${tgtCol.name}`);
    }
    if (selectedEdge && deleted.some((e) => e.id === selectedEdge.id)) {
      setSelectedEdge(null);
    }
  }, [tables, updateTable, selectedEdge, showFeedback]);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: DiagramEdge) => {
    setSelectedEdge(edge);
  }, []);

  // Resolve selected edge to the FK column (for the inspector panel)
  const selectedFk = useMemo(() => {
    if (!selectedEdge?.targetHandle) return null;
    const [tgtTableId, tgtColId] = selectedEdge.targetHandle.split('__');
    const fkTable = tables.find((t) => t.id === tgtTableId);
    const fkCol   = fkTable?.columns.find((c) => c.id === tgtColId);
    if (!fkTable || !fkCol) return null;
    return { fkTable, fkCol };
  }, [selectedEdge, tables]);

  const updateFkConfig = useCallback(
    (patch: Partial<ColumnSchema['generatorConfig']>) => {
      if (!selectedFk) return;
      const { fkTable, fkCol } = selectedFk;
      const updatedCol: ColumnSchema = {
        ...fkCol,
        generatorConfig: { ...fkCol.generatorConfig, ...patch },
      };
      updateTable({
        ...fkTable,
        columns: fkTable.columns.map((c) => (c.id === fkCol.id ? updatedCol : c)),
      });
    },
    [selectedFk, updateTable],
  );

  function handleAdd(table: DatasetSchema) {
    addTable(table);
    setShowAddForm(false);
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={onEdgesDelete}
        onEdgeClick={onEdgeClick}
        isValidConnection={isValidConnection}
        deleteKeyCode="Delete"
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: 'hsl(var(--background))' }}
      >
        <Background color="hsl(var(--border))" gap={20} />
        <Controls />
        <MiniMap
          nodeColor="#1e293b"
          maskColor="rgba(0,0,0,0.4)"
          style={{ background: 'hsl(var(--card))' }}
        />
      </ReactFlow>

      {/* Add table button / inline form */}
      {showAddForm ? (
        <AddTableForm
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <div className="absolute top-3 left-3 z-10">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Table
          </button>
        </div>
      )}

      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          onClick={handleAutoArrange}
          title="Re-layout tables by FK hierarchy"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Auto-Arrange
        </button>
        <button
          onClick={() => {
            const btn = document.querySelector<HTMLButtonElement>('.react-flow__controls-fitview');
            btn?.click();
          }}
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Fit View
        </button>
        <button
          onClick={() => handleDownload('png')}
          title="Download diagram as PNG"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Download className="w-3.5 h-3.5" />
          PNG
        </button>
        <button
          onClick={() => handleDownload('svg')}
          title="Download diagram as SVG"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Download className="w-3.5 h-3.5" />
          SVG
        </button>
        <button
          onClick={handleCopyImage}
          title="Copy diagram as image (paste into Word, Docs, Slack, etc.)"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy Image'}
        </button>
      </div>

      {/* Drag hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <span className="text-[10px] text-muted-foreground bg-card/70 border border-border px-2 py-1 rounded-full">
          Drag 🔑 PK handle → column to create FK · click edge to inspect · Delete to remove
        </span>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-lg border shadow-lg text-xs font-medium transition-all ${
            feedback.tone === 'error'
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {feedback.tone === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {feedback.message}
        </div>
      )}

      {/* FK edge inspector panel */}
      {selectedFk && (
        <div className="absolute bottom-3 right-3 z-20 bg-card border border-border rounded-xl shadow-2xl w-72 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
            <span className="text-xs font-semibold">FK: {selectedFk.fkTable.name}.{selectedFk.fkCol.name}</span>
            <button onClick={() => setSelectedEdge(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-4 space-y-3 text-xs">
            <div>
              <span className="text-muted-foreground">References: </span>
              <span className="font-mono">{selectedFk.fkCol.generatorConfig.poolRef ?? '—'}</span>
            </div>

            {/* Null rate */}
            <div className="flex items-center justify-between gap-2">
              <label className="text-muted-foreground">Null rate</label>
              <input
                type="number"
                min={0} max={1} step={0.05}
                className="w-20 bg-background border border-border rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
                value={selectedFk.fkCol.generatorConfig.fkNullRate ?? 0}
                onChange={(e) => updateFkConfig({ fkNullRate: parseFloat(e.target.value) || 0 })}
              />
            </div>

            {/* Distribution */}
            <div className="flex items-center justify-between gap-2">
              <label className="text-muted-foreground">Distribution</label>
              <select
                className="bg-background border border-border rounded px-2 py-0.5 text-xs focus:outline-none"
                value={selectedFk.fkCol.generatorConfig.fkDistribution ?? 'uniform'}
                onChange={(e) => updateFkConfig({ fkDistribution: e.target.value as 'uniform' | 'weighted' | 'fixed_per_parent' })}
              >
                <option value="uniform">Uniform</option>
                <option value="weighted">Weighted</option>
                <option value="fixed_per_parent">Fixed per parent</option>
              </select>
            </div>

            {/* Children per parent (only relevant for fixed_per_parent) */}
            {selectedFk.fkCol.generatorConfig.fkDistribution === 'fixed_per_parent' && (
              <div className="flex items-center justify-between gap-2">
                <label className="text-muted-foreground">Children/parent</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} step={1}
                    className="w-14 bg-background border border-border rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="min"
                    value={selectedFk.fkCol.generatorConfig.fkChildrenPerParent?.min ?? 1}
                    onChange={(e) => updateFkConfig({
                      fkChildrenPerParent: {
                        min: parseInt(e.target.value) || 1,
                        max: selectedFk.fkCol.generatorConfig.fkChildrenPerParent?.max ?? 3,
                      },
                    })}
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="number" min={0} step={1}
                    className="w-14 bg-background border border-border rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="max"
                    value={selectedFk.fkCol.generatorConfig.fkChildrenPerParent?.max ?? 3}
                    onChange={(e) => updateFkConfig({
                      fkChildrenPerParent: {
                        min: selectedFk.fkCol.generatorConfig.fkChildrenPerParent?.min ?? 1,
                        max: parseInt(e.target.value) || 3,
                      },
                    })}
                  />
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground pt-1">Press Delete to remove this FK relationship.</p>
          </div>
        </div>
      )}

      {/* Overwrite-confirm dialog */}
      {pendingOverwrite && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-80 overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/40">
              <span className="text-sm font-semibold">Replace existing FK?</span>
            </div>
            <div className="px-5 py-4 text-xs space-y-2">
              <p className="text-muted-foreground">This column already references:</p>
              <p className="font-mono text-foreground">{pendingOverwrite.oldRef}</p>
              <p className="text-muted-foreground mt-2">Replace with:</p>
              <p className="font-mono text-foreground">{pendingOverwrite.newRef}</p>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-border">
              <button
                onClick={() => setPendingOverwrite(null)}
                className="flex-1 py-1.5 rounded-lg text-xs border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmOverwrite}
                className="flex-1 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DiagramView (public component) ──────────────────────────────────────────

interface Props {
  onTableClick: (tableId: string) => void;
  onAddTable: () => void;
}

export function DiagramView({ onTableClick }: Props) {
  const { project, updateTable, addTable } = useProjectStore();
  const tables = project?.tables ?? [];

  return (
    <ReactFlowProvider>
      <DiagramFlow
        tables={tables}
        onTableClick={onTableClick}
        addTable={addTable}
        updateTable={updateTable}
      />
    </ReactFlowProvider>
  );
}
