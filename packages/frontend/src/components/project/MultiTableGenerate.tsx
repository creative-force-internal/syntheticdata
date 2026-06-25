import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Zap, RefreshCw, ArrowRight, Info, X, StopCircle, FlaskConical } from 'lucide-react';
import {
  startProjectGeneration,
  pollProjectJobStatus,
  getProjectPreview,
  cancelProjectJob,
} from '../../api/client.js';
import { useProjectStore } from '../../store/projectStore.js';
import { estimateChildRowCount, fmtNum } from '../../utils/estimate.js';

interface TableConfig {
  tableId: string;
  rowCount: number;
}

const PRESETS = [
  { label: '10k', value: 10_000 },
  { label: '100k', value: 100_000 },
  { label: '1M', value: 1_000_000 },
];

export function MultiTableGenerate() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { project, jobResults, setJobResult, setTableRowCounts } = useProjectStore();
  const tables = project?.tables ?? [];

  const [tableConfigs, setTableConfigs] = useState<TableConfig[]>([]);
  const [seedInput, setSeedInput] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedRows, setCompletedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResults, setPreviewResults] = useState<Record<string, unknown[]> | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init configs when tables change
  useEffect(() => {
    setTableConfigs(tables.map(t => ({ tableId: t.id, rowCount: 100 })));
  }, [tables.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep projectStore in sync so SchemaEditor's FkConfigModal can show estimates
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const c of tableConfigs) counts[c.tableId] = c.rowCount;
    setTableRowCounts(counts);
  }, [tableConfigs, setTableRowCounts]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }
  useEffect(() => () => stopPolling(), []);

  function setRowCount(tableId: string, value: number) {
    setTableConfigs(prev => prev.map(c => c.tableId === tableId ? { ...c, rowCount: value } : c));
  }

  // Compute row count map for estimation
  const rowCountMap: Record<string, number> = {};
  for (const c of tableConfigs) rowCountMap[c.tableId] = c.rowCount;

  // ETA calculation
  const rowsPerSec = startTime && completedRows > 0
    ? completedRows / ((Date.now() - startTime) / 1000)
    : null;
  const etaSec = rowsPerSec && totalRows > completedRows
    ? Math.ceil((totalRows - completedRows) / rowsPerSec)
    : null;

  async function handleGenerate() {
    if (!project) return;
    setRunning(true); setProgress(0); setCompletedRows(0);
    setError(null); setCancelling(false);
    const total = tableConfigs.reduce((s, c) => s + c.rowCount, 0);
    setTotalRows(total);
    setStartTime(Date.now());

    try {
      const seed = seedInput.trim() ? parseInt(seedInput, 10) : undefined;
      const { jobId, seed: resolvedSeed } = await startProjectGeneration(project.id, tableConfigs, seed);
      setCurrentJobId(jobId);

      pollRef.current = setInterval(async () => {
        try {
          const { status, progress: prog, completedRows: done, errorMessage } = await pollProjectJobStatus(jobId);
          setProgress(prog);
          setCompletedRows(done ?? 0);

          if (status === 'done') {
            stopPolling();
            const preview = await getProjectPreview(jobId, 5);
            setJobResult(jobId, resolvedSeed, preview);
            setRunning(false); setCurrentJobId(null);
          } else if (status === 'cancelled') {
            stopPolling();
            setError('Generation was cancelled.');
            setRunning(false); setCurrentJobId(null); setCancelling(false);
          } else if (status === 'error') {
            stopPolling();
            setError(errorMessage ?? 'Generation failed');
            setRunning(false); setCurrentJobId(null);
          }
        } catch (e) {
          stopPolling(); setError((e as Error).message); setRunning(false); setCurrentJobId(null);
        }
      }, 600);
    } catch (e) {
      setError((e as Error).message); setRunning(false); setCurrentJobId(null);
    }
  }

  async function handleCancel() {
    if (!currentJobId) return;
    setCancelling(true);
    try { await cancelProjectJob(currentJobId); } catch { /* ignore */ }
  }

  async function handlePreview() {
    if (!project) return;
    setPreviewing(true);
    setError(null);
    setPreviewResults(null);
    try {
      const previewConfigs = tableConfigs.map(c => ({ tableId: c.tableId, rowCount: 50 }));
      const seed = seedInput.trim() ? parseInt(seedInput, 10) : undefined;
      const { jobId } = await startProjectGeneration(project.id, previewConfigs, seed);
      // Poll until done
      await new Promise<void>((resolve, reject) => {
        const iv = setInterval(async () => {
          try {
            const { status, errorMessage } = await pollProjectJobStatus(jobId);
            if (status === 'done') {
              clearInterval(iv);
              const preview = await getProjectPreview(jobId, 50);
              setPreviewResults(preview as Record<string, unknown[]>);
              resolve();
            } else if (status === 'error') {
              clearInterval(iv);
              reject(new Error(errorMessage ?? 'Preview failed'));
            } else if (status === 'cancelled') {
              clearInterval(iv);
              reject(new Error('Preview cancelled'));
            }
          } catch (e) { clearInterval(iv); reject(e); }
        }, 400);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Add tables to your project before generating data.
      </div>
    );
  }

  const isDone = !!jobResults;

  return (
    <div className="flex flex-col items-center p-8 max-w-2xl mx-auto w-full">
      <div className="mb-6 text-center">
        <Zap className="w-10 h-10 mx-auto mb-3 text-primary" />
        <h2 className="text-xl font-bold">Generate Data</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Configure row counts per table and click Generate
        </p>
      </div>

      <div className="w-full bg-card border border-border rounded-xl p-6 space-y-5">
        {/* Table row count inputs */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Row Counts
          </label>
          <div className="space-y-2">
            {tables.map(table => {
              const config = tableConfigs.find(c => c.tableId === table.id);
              const rowCount = config?.rowCount ?? 100;
              const estimate = estimateChildRowCount(table, tables, rowCountMap);
              const showHint = estimate !== null && Math.abs(estimate - rowCount) / Math.max(estimate, rowCount) > 0.2;

              return (
                <div key={table.id} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono flex-1 truncate">{table.name}</span>
                    <span className="text-xs text-muted-foreground">{table.columns.length} cols</span>

                    {/* Preset buttons */}
                    <div className="flex gap-1">
                      {PRESETS.map(p => (
                        <button
                          key={p.value}
                          onClick={() => setRowCount(table.id, p.value)}
                          disabled={running}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted transition-colors disabled:opacity-40 font-mono"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="number"
                      min={1}
                      max={10_000_000}
                      className="w-28 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-right"
                      value={rowCount}
                      disabled={running}
                      onChange={e => setRowCount(table.id, Math.min(10_000_000, Math.max(1, Number(e.target.value))))}
                    />
                    <span className="text-xs text-muted-foreground w-8">rows</span>
                  </div>

                  {/* Estimate hint */}
                  {showHint && estimate !== null && (
                    <div className="flex items-center gap-2 pl-2 text-xs text-blue-400">
                      <Info className="w-3 h-3 shrink-0" />
                      <span>~{fmtNum(estimate)} rows suggested based on parent × avg children</span>
                      <button
                        onClick={() => setRowCount(table.id, estimate)}
                        disabled={running}
                        className="text-primary underline hover:no-underline disabled:opacity-40"
                      >
                        Use estimate
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Seed */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Seed <span className="text-muted-foreground/60">(blank = random)</span>
          </label>
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 42"
            value={seedInput}
            disabled={running}
            onChange={e => setSeedInput(e.target.value)}
          />
        </div>

        {/* Progress */}
        {running && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>
                {completedRows > 0
                  ? `Generating ${fmtNum(completedRows)} / ${fmtNum(totalRows)} rows${rowsPerSec ? ` · ${fmtNum(Math.round(rowsPerSec))}/s` : ''}`
                  : 'Starting…'}
              </span>
              <span className="flex items-center gap-2">
                {etaSec !== null && <span>~{etaSec}s left</span>}
                {progress}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-xs text-destructive">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Done summary */}
        {isDone && jobResults && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-green-400 mb-2">Generation complete!</p>
            {Object.entries(jobResults).map(([tId, rows]) => {
              const tbl = tables.find(t => t.id === tId);
              return (
                <div key={tId} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-foreground">{tbl?.name ?? tId}</span>
                  <span className="text-muted-foreground">{rows.length} preview rows</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Validate & Preview results */}
        {previewResults && !running && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-blue-400 mb-2">Preview (50 rows per table)</p>
            {Object.entries(previewResults).map(([tId, rows]) => {
              const tbl = tables.find(t => t.id === tId);
              return (
                <div key={tId} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-foreground">{tbl?.name ?? tId}</span>
                  <span className="text-muted-foreground">{(rows as unknown[]).length} rows</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={running || previewing}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Generating…</>
            ) : (
              <><Zap className="w-3.5 h-3.5" />Generate All</>
            )}
          </button>

          {!running && (
            <button
              onClick={handlePreview}
              disabled={previewing || running}
              className="flex items-center gap-2 border border-border px-3 py-2 rounded-lg text-xs hover:bg-muted transition-colors disabled:opacity-50"
            >
              {previewing ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Previewing…</>
              ) : (
                <><FlaskConical className="w-3.5 h-3.5" />Validate & Preview</>
              )}
            </button>
          )}

          {running && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-2 border border-destructive/50 text-destructive px-3 py-2 rounded-lg text-xs hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <StopCircle className="w-3.5 h-3.5" />
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}

          {isDone && !running && (
            <button
              onClick={() => projectId && navigate(`/projects/${projectId}/export`)}
              className="flex items-center gap-2 border border-border px-3 py-2 rounded-lg text-xs hover:bg-muted transition-colors"
            >
              Go to Export
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

        </div>

        {/* Seed info */}
        {useProjectStore.getState().jobSeed !== null && (
          <p className="text-xs text-muted-foreground">
            Last seed: <span className="font-mono text-foreground">{useProjectStore.getState().jobSeed}</span>
          </p>
        )}

      </div>
    </div>
  );
}
