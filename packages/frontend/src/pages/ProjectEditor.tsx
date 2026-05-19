import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { getProject, updateProject } from '../api/client.js';
import type { DatasetSchema, ProjectTab } from '../types/index.js';
import { useProjectStore } from '../store/projectStore.js';
import { useAppStore } from '../store/appStore.js';
import { TableSidebar } from '../components/project/TableSidebar.js';
import { DiagramView } from '../components/project/DiagramView.js';
import { MultiTableGenerate } from '../components/project/MultiTableGenerate.js';
import { MultiTableExport } from '../components/project/MultiTableExport.js';
import { QueryPanel } from '../components/project/QueryPanel.js';
import { SchemaEditor } from '../components/schema/SchemaEditor.js';

const VALID_TABS = new Set<ProjectTab>(['tables', 'diagram', 'generate', 'export', 'query']);

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'tables', label: 'Tables' },
  { id: 'diagram', label: 'Diagram' },
  { id: 'generate', label: 'Generate' },
  { id: 'export', label: 'Export' },
  { id: 'query', label: 'Query' },
];

function makeEmptyTable(): DatasetSchema {
  return {
    id: nanoid(),
    name: 'new_table',
    columns: [],
    rules: [],
    sourceType: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// No props — everything comes from URL params
export function ProjectEditor() {
  const { projectId = '', tab } = useParams<{ projectId: string; tab: string }>();
  const navigate = useNavigate();

  // Resolve active tab from URL; fall back to 'tables'
  const activeTab: ProjectTab =
    tab && VALID_TABS.has(tab as ProjectTab) ? (tab as ProjectTab) : 'tables';

  function navigateTab(t: ProjectTab) {
    navigate(`/projects/${projectId}/${t}`);
  }

  const {
    project,
    activeTableId,
    setProject,
    setActiveTableId,
    updateTable,
    addTable,
    removeTable,
    reset,
  } = useProjectStore();

  const { setSchema, schema: appSchema } = useAppStore();

  const [projectName, setProjectName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load project when projectId changes
  useEffect(() => {
    reset();
    setLoading(true);
    getProject(projectId)
      .then((p) => {
        setProject(p);
        setProjectName(p.name);
        if (p.tables.length > 0) setActiveTableId(p.tables[0].id);
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Sync active table → AppStore schema (for SchemaEditor)
  useEffect(() => {
    if (!project || !activeTableId) return;
    const table = project.tables.find((t) => t.id === activeTableId);
    if (table) setSchema(table, true);
  }, [activeTableId, project, setSchema]);

  // Sync AppStore schema edits → ProjectStore
  useEffect(() => {
    if (!appSchema || !activeTableId) return;
    if (appSchema.id !== activeTableId) return;
    updateTable(appSchema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSchema]);

  const handleAddTable = useCallback(() => {
    addTable(makeEmptyTable());
  }, [addTable]);

  const handleDeleteTable = useCallback(
    (id: string) => removeTable(id),
    [removeTable],
  );

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProject(project.id, projectName.trim() || project.name, project.tables);
      setProject(updated);
      setProjectName(updated.name);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const handleTableClick = useCallback(
    (tableId: string) => {
      navigateTab('tables');
      setActiveTableId(tableId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, setActiveTableId],
  );

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface text-on-surface-variant gap-3 font-label text-[11px] uppercase tracking-widest">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        Loading project…
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface gap-4">
        <p className="text-error text-sm font-label">{loadError ?? 'Project not found'}</p>
        <Link to="/" className="text-[11px] font-label uppercase tracking-widest text-primary hover:underline">
          ← Back to Projects
        </Link>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      {/* Header */}
      <header className="shrink-0 border-b border-surface-container bg-surface/95 backdrop-blur-md">
        {/* Row 1: back link + name + save (always single row, wraps in worst case) */}
        <div className="flex items-center gap-3 px-4 h-14">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </Link>

          <span className="text-outline-variant hidden sm:inline">|</span>

          {/* Editable project name */}
          <input
            className="bg-transparent text-sm font-semibold font-headline focus:outline-none focus:border-b focus:border-primary min-w-0 flex-1 text-on-surface"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />

          <span className="text-[10px] font-label text-on-surface-variant hidden md:block uppercase tracking-widest shrink-0">
            {project.tables.length} {project.tables.length === 1 ? 'table' : 'tables'}
          </span>

          {/* Tab switcher — inline on md+ */}
          <nav className="hidden md:flex items-center gap-0.5 mx-auto">
            {TABS.map((t) => (
              <Link
                key={t.id}
                to={`/projects/${projectId}/${t.id}`}
                className={`px-3 py-1.5 font-label text-[10px] uppercase tracking-widest rounded transition-colors ${
                  activeTab === t.id
                    ? 'bg-surface-container text-studio-blue border-b-2 border-studio-blue font-bold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-label uppercase tracking-widest bg-primary text-on-primary-fixed px-3 md:px-4 py-2 rounded-md hover:brightness-110 disabled:opacity-50 transition-all shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>

        {/* Row 2 (mobile only): tab switcher in horizontal-scroll strip */}
        <nav className="md:hidden flex items-center gap-0.5 px-2 pb-2 overflow-x-auto whitespace-nowrap">
          {TABS.map((t) => (
            <Link
              key={t.id}
              to={`/projects/${projectId}/${t.id}`}
              className={`px-3 py-1.5 font-label text-[10px] uppercase tracking-widest rounded transition-colors shrink-0 ${
                activeTab === t.id
                  ? 'bg-surface-container text-studio-blue border-b-2 border-studio-blue font-bold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {saveError && (
        <div className="shrink-0 mx-4 mt-2 bg-error/10 border border-error/30 rounded-md px-3 py-2 text-xs text-error font-label">
          {saveError}
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'tables' && (
          <div className="flex h-full relative">
            <TableSidebar
              tables={project.tables}
              activeTableId={activeTableId}
              onSelectTable={(id) => setActiveTableId(id)}
              onAddTable={handleAddTable}
              onDeleteTable={handleDeleteTable}
            />
            <div className="flex-1 overflow-hidden">
              {activeTableId && project.tables.find((t) => t.id === activeTableId) ? (
                <SchemaEditor />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30">
                    {project.tables.length === 0 ? 'add_box' : 'table_chart'}
                  </span>
                  <p className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant/60">
                    {project.tables.length === 0 ? 'Add a table to get started' : 'Select a table from the sidebar'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'diagram' && (
          <div className="h-full">
            <DiagramView onTableClick={handleTableClick} onAddTable={handleAddTable} />
          </div>
        )}

        {activeTab === 'generate' && (
          <div className="h-full overflow-auto">
            <MultiTableGenerate />
          </div>
        )}

        {activeTab === 'export' && (
          <div className="h-full overflow-auto">
            <MultiTableExport />
          </div>
        )}

        {activeTab === 'query' && (
          <div className="h-full overflow-hidden">
            <QueryPanel />
          </div>
        )}
      </main>
    </div>
  );
}
