import { useEffect, useRef, useState } from 'react';
import { Play, Download, Database, RefreshCw, HardDrive } from 'lucide-react';
import { queryProjectData, queryProjectSavedData, getProjectDataInfo, projectSqliteUrl } from '../../api/client.js';
import { useProjectStore } from '../../store/projectStore.js';
import type { ProjectDataInfo } from '../../types/index.js';

export function QueryPanel() {
  const { project, jobId } = useProjectStore();
  const tables = project?.tables ?? [];

  const [sql, setSql] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ rows: Record<string, unknown>[]; columns: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataInfo, setDataInfo] = useState<ProjectDataInfo | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check for saved project data on mount / project change
  useEffect(() => {
    if (!project?.id) return;
    getProjectDataInfo(project.id)
      .then(setDataInfo)
      .catch(() => setDataInfo(null));
  }, [project?.id]);

  const hasSavedData = dataInfo?.hasSavedData ?? false;
  // Tables list: prefer saved db's table names when available, else schema tables
  const displayTables = hasSavedData && dataInfo?.tableNames?.length
    ? dataInfo.tableNames
    : tables.map(t => t.name);

  function insertSnippet(tableName: string) {
    const snippet = `SELECT * FROM "${tableName}" LIMIT 100;`;
    setSql(snippet);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function handleRun() {
    if (!sql.trim() || !project?.id) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = jobId && !hasSavedData
        ? await queryProjectData(jobId, sql.trim())
        : await queryProjectSavedData(project.id, sql.trim());
      setResult(res);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (e as Error).message;
      setError(msg);
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
  }

  const canQuery = !!project;
  const noJob = !jobId;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/40">
        <Database className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SQL Query</span>
        {hasSavedData && dataInfo?.savedAt && (
          <span className="flex items-center gap-1 text-[10px] text-green-400 border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded">
            <HardDrive className="w-3 h-3" />
            Saved {new Date(dataInfo.savedAt).toLocaleDateString()}
          </span>
        )}
        {!hasSavedData && jobId && (
          <span className="text-[10px] text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 rounded">
            Session only — save to persist
          </span>
        )}
        <div className="flex-1" />
        {!noJob && (
          <a
            href={projectSqliteUrl(jobId!)}
            download
            className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Download className="w-3 h-3" />
            Download .db
          </a>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: editor + results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL editor */}
          <div className="shrink-0 p-4 border-b border-border space-y-2">
            <textarea
              ref={textareaRef}
              className="w-full h-28 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder='SELECT * FROM "users" LIMIT 100;\n\n(Ctrl+Enter to run)'
              disabled={!canQuery}
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleRun}
                disabled={!canQuery || running || !sql.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {running ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {running ? 'Running…' : 'Run Query'}
              </button>
              <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
              {result && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {result.rows.length} row{result.rows.length !== 1 ? 's' : ''}
                  {result.rows.length === 1000 && ' (max)'}
                </span>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {error && (
              <div className="m-4 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-xs text-destructive font-mono whitespace-pre-wrap">
                {error}
              </div>
            )}

            {result && result.rows.length === 0 && !error && (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                Query returned no rows.
              </div>
            )}

            {result && result.columns.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    {result.columns.map(c => (
                      <th key={c} className="px-3 py-2 text-left font-mono font-semibold text-muted-foreground whitespace-nowrap border-b border-border">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      {result.columns.map(c => (
                        <td key={c} className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap max-w-[220px] truncate" title={String(row[c] ?? '')}>
                          {row[c] === null ? (
                            <span className="italic opacity-40">null</span>
                          ) : (
                            String(row[c]).slice(0, 60)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!result && !error && !running && (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Database className="w-8 h-8 opacity-30" />
                <p className="text-xs">Write a query above and press Run.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: table chips */}
        {displayTables.length > 0 && (
          <div className="w-48 shrink-0 border-l border-border overflow-y-auto p-3 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tables</p>
            {displayTables.map(name => (
              <button
                key={name}
                onClick={() => insertSnippet(name)}
                disabled={!canQuery}
                className="w-full text-left px-2 py-1.5 rounded-md text-xs font-mono hover:bg-muted transition-colors disabled:opacity-40 truncate"
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
