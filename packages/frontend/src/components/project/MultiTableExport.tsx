import { useState, useEffect } from 'react';
import { Download, ChevronDown, ChevronRight, FileText, Braces, Database, HardDrive, Save } from 'lucide-react';
import { projectZipUrl, projectSqliteUrl, projectSavedDataZipUrl, projectSavedDataSqliteUrl, getProjectDataInfo } from '../../api/client.js';
import { useProjectStore } from '../../store/projectStore.js';
import type { ProjectDataInfo } from '../../types/index.js';

type ExportFormat = 'csv' | 'json' | 'sql' | 'sqlite';

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: 'csv',
    label: 'CSV',
    icon: <FileText className="w-4 h-4" />,
    desc: 'Comma-separated values, one file per table',
  },
  {
    value: 'json',
    label: 'JSON',
    icon: <Braces className="w-4 h-4" />,
    desc: 'JSON array per table',
  },
  {
    value: 'sql',
    label: 'SQL',
    icon: <Database className="w-4 h-4" />,
    desc: 'INSERT statements per table',
  },
  {
    value: 'sqlite',
    label: 'SQLite',
    icon: <HardDrive className="w-4 h-4" />,
    desc: 'Single .db file — queryable in-app',
  },
];

export function MultiTableExport() {
  const { project, jobId, jobResults } = useProjectStore();
  const tables = project?.tables ?? [];

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [dataInfo, setDataInfo] = useState<ProjectDataInfo | null>(null);

  useEffect(() => {
    if (!project?.id) return;
    getProjectDataInfo(project.id).then(setDataInfo).catch(() => {});
  }, [project?.id]);

  const hasFreshData = Boolean(jobId && jobResults);
  const hasSavedData = Boolean(dataInfo?.hasSavedData);

  function toggleTable(id: string) {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDownload() {
    if (hasFreshData && jobId) {
      if (format === 'sqlite') {
        window.open(projectSqliteUrl(jobId));
      } else {
        window.open(projectZipUrl(jobId, format as 'csv' | 'json' | 'sql'));
      }
    } else if (hasSavedData && project?.id) {
      if (format === 'sqlite') {
        window.open(projectSavedDataSqliteUrl(project.id));
      } else {
        window.open(projectSavedDataZipUrl(project.id, format as 'csv' | 'json' | 'sql'));
      }
    }
  }

  if (!hasFreshData && !hasSavedData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Download className="w-10 h-10 opacity-30" />
        <p className="text-sm">No generated data yet.</p>
        <p className="text-xs opacity-60">Run generation first in the Generate tab.</p>
      </div>
    );
  }

  const savedAt = dataInfo?.savedAt ? new Date(dataInfo.savedAt).toLocaleDateString() : null;

  return (
    <div className="flex flex-col items-center p-8 max-w-2xl mx-auto w-full">
      <div className="mb-6 text-center">
        <Download className="w-10 h-10 mx-auto mb-3 text-primary" />
        <h2 className="text-xl font-bold">Export Data</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {hasFreshData ? 'Download your generated datasets as a ZIP' : 'Export from saved project database'}
        </p>
      </div>

      <div className="w-full space-y-5">
        {/* Summary */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {hasFreshData ? 'Generation Summary' : 'Saved Data'}
            </h3>
            {!hasFreshData && savedAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Save className="w-3 h-3" /> Saved {savedAt}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {hasFreshData
              ? tables.map((table) => {
                  const rows = jobResults![table.id];
                  return (
                    <div key={table.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono">{table.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {rows ? `${rows.length} rows` : 'no data'}
                      </span>
                    </div>
                  );
                })
              : (dataInfo?.tableNames ?? []).map((name) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="font-mono">{name}</span>
                    <span className="text-muted-foreground text-xs">saved</span>
                  </div>
                ))}
          </div>
        </div>

        {/* Format selector */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Export Format
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-colors ${
                  format === opt.value
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.icon}
                <span className="text-xs font-semibold">{opt.label}</span>
                <span className="text-[10px] leading-tight opacity-70">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          {format === 'sqlite' ? 'Download .db (SQLite)' : `Download ZIP (${format.toUpperCase()})`}
        </button>
        {format === 'sqlite' && (
          <p className="text-xs text-center text-muted-foreground">
            Or use the <strong>Query</strong> tab to explore data interactively.
          </p>
        )}

        {/* Preview toggle — only available for fresh in-memory generation */}
        {hasFreshData && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Preview (first 5 rows)
              </h3>
            </div>

            {tables.map((table) => {
              const rows = jobResults![table.id];
              if (!rows || rows.length === 0) return null;
              const isOpen = expandedTables.has(table.id);
              const previewRows = rows.slice(0, 5);
              const cols = Object.keys(previewRows[0] ?? {});

              return (
                <div key={table.id} className="border-b border-border last:border-0">
                  <button
                    onClick={() => toggleTable(table.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-mono font-medium">{table.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {rows.length} rows · {cols.length} cols
                    </span>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50">
                            {cols.map((c) => (
                              <th
                                key={c}
                                className="px-3 py-2 text-left font-mono text-muted-foreground font-medium whitespace-nowrap"
                              >
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, i) => (
                            <tr key={i} className="border-t border-border/50 hover:bg-muted/20">
                              {cols.map((c) => (
                                <td
                                  key={c}
                                  className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap max-w-[160px] truncate"
                                  title={String(row[c] ?? '')}
                                >
                                  {row[c] === null ? (
                                    <span className="italic opacity-40">null</span>
                                  ) : (
                                    String(row[c]).slice(0, 30)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
