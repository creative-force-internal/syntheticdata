import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, X, Loader2, Upload, FolderPlus, Folder, MoreVertical } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { nanoid } from 'nanoid';
import {
  listProjects, createProject, deleteProject, inferFromPrisma, inferProjectFromSql,
  previewProjectFromSql,
  inferProjectFromEr, inferFromCsv, duplicateProject, updateProject, moveProjectToGroup,
  listTemplates, createFromTemplate,
  listGroups, createGroup, updateGroup, deleteGroup,
} from '../api/client.js';
import type { TemplateSummary } from '../api/client.js';
import type { Project, GroupWithCount, FkCandidate, DatasetSchema } from '../types/index.js';
import { Sidebar } from '../components/layout/Sidebar.js';

const UNCATEGORIZED_KEY = '__uncategorized__';

// Lightweight icon renderer: accepts emoji (rendered raw) or a short alpha name
// that maps to a hardcoded subset. Anything else falls back to a folder glyph.
function renderGroupIcon(icon: string): React.ReactElement {
  const trimmed = icon.trim();
  if (!trimmed) return <Folder className="w-4 h-4" />;
  // Heuristic: if it contains any non-ASCII codepoint, treat as emoji.
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return <span className="text-base leading-none">{trimmed}</span>;
  }
  // Plain alpha name like "folder", "briefcase" → fallback for v1 to a folder glyph
  // and prepend the name as title text. Keeps zero dynamic-import complexity.
  return <Folder className="w-4 h-4" />;
}

type ModalMode = 'manual' | 'prisma' | 'sql' | 'csv' | 'er' | 'template' | null;

const PAGE_SIZE = 25;

export function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<GroupWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  // Group modal state
  const [groupModalMode, setGroupModalMode] = useState<'create' | { type: 'rename'; group: GroupWithCount } | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<GroupWithCount | null>(null);

  useEffect(() => {
    Promise.all([listProjects(), listGroups()])
      .then(([ps, gs]) => { setProjects(ps); setGroups(gs); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  const filteredProjects = useMemo(
    () => projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
  );

  // Group projects by groupId (only used when not searching).
  const groupedProjects = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      const key = p.groupId ?? UNCATEGORIZED_KEY;
      const bucket = map.get(key);
      if (bucket) bucket.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [projects]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));

  // Clamp page when filter results shrink (e.g. search narrows, project deleted)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Reset to first page when the search query changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const pagedProjects = useMemo(
    () => filteredProjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredProjects, page]
  );

  // Recompute group projectCount locally so the UI stays consistent with state.
  const groupsWithLocalCount = useMemo(
    () => groups.map(g => ({ ...g, projectCount: groupedProjects.get(g.id)?.length ?? 0 })),
    [groups, groupedProjects]
  );

  async function handleDelete(id: string) {
    await deleteProject(id);
    setProjects((ps) => ps.filter((p) => p.id !== id));
  }

  async function handleDuplicate(id: string) {
    const copy = await duplicateProject(id);
    setProjects((ps) => [copy, ...ps]);
  }

  async function handleRename(id: string, name: string) {
    const project = projects.find(p => p.id === id);
    if (!project || !name.trim() || name.trim() === project.name) return;
    const updated = await updateProject(id, name.trim(), project.tables);
    setProjects(ps => ps.map(p => p.id === id ? updated : p));
  }

  async function handleMoveProject(projectId: string, groupId: string | null) {
    const updated = await moveProjectToGroup(projectId, groupId);
    setProjects(ps => ps.map(p => p.id === projectId ? updated : p));
  }

  async function handleCreateGroup(name: string, icon: string) {
    const g = await createGroup(name, icon);
    setGroups(gs => [...gs, { ...g, projectCount: 0 }]);
  }

  async function handleRenameGroup(id: string, patch: { name?: string; icon?: string }) {
    const g = await updateGroup(id, patch);
    setGroups(gs => gs.map(x => x.id === id ? { ...x, ...g } : x));
  }

  async function handleDeleteGroup(id: string) {
    const result = await deleteGroup(id);
    setGroups(gs => gs.filter(g => g.id !== id));
    // Reassigned projects: update their groupId to null in local state
    if (result.reassignedProjects > 0) {
      setProjects(ps => ps.map(p => p.groupId === id ? { ...p, groupId: null } : p));
    }
  }

  function handleCreated(project: Project) {
    navigate(`/projects/${project.id}/tables`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar onNewProject={() => setModalMode('manual')} />

      <main className="flex-1 md:ml-64 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-4 md:px-8 pl-14 md:pl-8 w-full h-16 sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-surface-container shrink-0">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
              <input
                className="bg-surface-container-low border-none rounded-md py-2 pl-10 pr-4 text-sm w-full focus:ring-1 focus:ring-tertiary placeholder:text-on-surface-variant/50 font-body outline-none"
                placeholder="Search projects..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero */}
          <section className="relative px-4 md:px-8 pt-10 md:pt-14 pb-14 md:pb-20 overflow-hidden">
            <div className="hidden md:block">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] -z-10 rounded-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-tertiary/5 blur-[100px] -z-10 rounded-full pointer-events-none" />
            </div>
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container border border-outline-variant/20 rounded-full mb-6">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">Engine v2.4 Live</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-bold font-headline leading-tight tracking-tight mb-5 bg-gradient-to-br from-on-surface via-on-surface to-primary-fixed-dim bg-clip-text text-transparent">
                Generate realistic<br />synthetic datasets
              </h1>
              <p className="text-sm md:text-base text-on-surface-variant max-w-2xl mb-8 leading-relaxed">
                Automated schema inference with FK relationships and privacy controls.
                Build production-grade mock environments from Prisma or SQL in seconds.
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => setModalMode('manual')}
                  className="px-7 py-3.5 bg-primary text-on-primary-fixed font-headline font-extrabold tracking-wider text-sm rounded-md hover:brightness-110 transition-all duration-300"
                >
                  START SYNTHESIS
                </button>
                <button
                  onClick={() => navigate('/single')}
                  className="px-7 py-3.5 bg-surface-container border border-outline-variant/30 text-on-surface font-headline font-bold text-sm rounded-md hover:bg-surface-bright transition-all"
                >
                  SINGLE TABLE
                </button>
              </div>
            </div>
          </section>

          {/* Quick Import */}
          <section className="px-4 md:px-8 mb-10 md:mb-14">
            <div className="flex items-center gap-3 mb-7">
              <h2 className="font-headline text-2xl font-bold">Quick Import</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-outline-variant/30 to-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {/* Prisma */}
              <button
                onClick={() => setModalMode('prisma')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">account_tree</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
                    <span className="material-symbols-outlined text-primary">schema</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">Prisma Schema</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Import your .prisma file to automatically generate relational synthetic snapshots.
                  </p>
                  <div className="flex items-center gap-2 text-primary font-label text-[11px] font-bold tracking-widest uppercase">
                    Import Schema
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>

              {/* SQL DDL */}
              <button
                onClick={() => setModalMode('sql')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-tertiary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">database</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
                    <span className="material-symbols-outlined text-tertiary">terminal</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">SQL DDL</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Paste raw SQL definitions or upload .sql dumps for instant entity mapping.
                  </p>
                  <div className="flex items-center gap-2 text-tertiary font-label text-[11px] font-bold tracking-widest uppercase">
                    Upload Script
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>

              {/* CSV */}
              <button
                onClick={() => setModalMode('csv')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-tertiary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">table_view</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
                    <Upload className="w-5 h-5 text-tertiary" />
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">CSV Upload</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Upload a CSV file and auto-detect column types to seed a single-table project.
                  </p>
                  <div className="flex items-center gap-2 text-tertiary font-label text-[11px] font-bold tracking-widest uppercase">
                    Upload File
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>

              {/* ER JSON */}
              <button
                onClick={() => setModalMode('er')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">data_object</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
                    <span className="material-symbols-outlined text-primary">data_object</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">ER JSON</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Upload an ER schema JSON describing tables, columns, and relationships.
                  </p>
                  <div className="flex items-center gap-2 text-primary font-label text-[11px] font-bold tracking-widest uppercase">
                    Upload ER JSON
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>

              {/* From Template */}
              <button
                onClick={() => setModalMode('template')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">auto_awesome</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
                    <span className="material-symbols-outlined text-primary">auto_awesome</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">From Template</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Pre-built multi-table bundles for e-commerce, SaaS, and healthcare with FK relations.
                  </p>
                  <div className="flex items-center gap-2 text-primary font-label text-[11px] font-bold tracking-widest uppercase">
                    Choose Template
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Projects Table */}
          <section className="px-4 md:px-8 pb-14 md:pb-20">
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-3">
                <h2 className="font-headline text-2xl font-bold">Recent Projects</h2>
                <span className="px-2 py-0.5 bg-surface-container-highest rounded font-label text-[10px] text-on-surface-variant">
                  {(isSearching ? filteredProjects.length : projects.length).toString().padStart(2, '0')} {isSearching ? 'FOUND' : 'TOTAL'}
                </span>
              </div>
              {!isSearching && (
                <button
                  onClick={() => setGroupModalMode('create')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant/30 rounded text-on-surface text-[11px] font-label uppercase tracking-widest hover:bg-surface-bright transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  New Group
                </button>
              )}
            </div>

            {error && (
              <div className="mb-6 bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-sm text-error font-label">
                {error}
              </div>
            )}

            {loading ? (
              <div className="bg-surface-container rounded-xl border border-outline-variant/10 flex items-center justify-center py-16 gap-3 text-on-surface-variant font-label text-[11px] uppercase tracking-widest">
                <Loader2 className="w-5 h-5 animate-spin" />
                Initializing clusters...
              </div>
            ) : isSearching ? (
              // ─── Flat search view ──────────────────────────────────────────
              <FlatProjectTable
                projects={pagedProjects}
                groups={groupsWithLocalCount}
                totalFiltered={filteredProjects.length}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onClearSearch={() => setSearchQuery('')}
                searchQuery={searchQuery}
                onOpen={(p) => navigate(`/projects/${p.id}/tables`)}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onRename={handleRename}
                onMove={handleMoveProject}
              />
            ) : projects.length === 0 ? (
              <div className="bg-surface-container rounded-xl border border-outline-variant/10 text-center py-16">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 block mb-3">folder_open</span>
                <p className="text-sm font-label uppercase tracking-widest text-on-surface-variant/60">No projects yet</p>
                <button
                  onClick={() => setModalMode('manual')}
                  className="mt-4 px-5 py-2.5 bg-primary text-on-primary-fixed font-headline font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 transition-all"
                >
                  Create First Project
                </button>
              </div>
            ) : (
              // ─── Grouped view ─────────────────────────────────────────────
              <div className="space-y-6">
                {groupsWithLocalCount.map(group => (
                  <GroupSection
                    key={group.id}
                    group={group}
                    projects={groupedProjects.get(group.id) ?? []}
                    groups={groupsWithLocalCount}
                    onRenameGroup={() => setGroupModalMode({ type: 'rename', group })}
                    onDeleteGroup={() => setGroupToDelete(group)}
                    onOpen={(p) => navigate(`/projects/${p.id}/tables`)}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onRename={handleRename}
                    onMove={handleMoveProject}
                  />
                ))}
                <GroupSection
                  group={null}
                  projects={groupedProjects.get(UNCATEGORIZED_KEY) ?? []}
                  groups={groupsWithLocalCount}
                  onRenameGroup={undefined}
                  onDeleteGroup={undefined}
                  onOpen={(p) => navigate(`/projects/${p.id}/tables`)}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onRename={handleRename}
                  onMove={handleMoveProject}
                />
              </div>
            )}
          </section>
        </div>
      </main>

      {modalMode && modalMode !== 'template' && (
        <ImportModal
          mode={modalMode}
          groups={groupsWithLocalCount}
          onClose={() => setModalMode(null)}
          onCreated={handleCreated}
        />
      )}
      {modalMode === 'template' && (
        <TemplateModal
          groups={groupsWithLocalCount}
          onClose={() => setModalMode(null)}
          onCreated={handleCreated}
        />
      )}
      {groupModalMode === 'create' && (
        <GroupModal
          mode="create"
          onClose={() => setGroupModalMode(null)}
          onSubmit={async (name, icon) => {
            await handleCreateGroup(name, icon);
            setGroupModalMode(null);
          }}
        />
      )}
      {groupModalMode && typeof groupModalMode === 'object' && groupModalMode.type === 'rename' && (
        <GroupModal
          mode="rename"
          initial={{ name: groupModalMode.group.name, icon: groupModalMode.group.icon }}
          onClose={() => setGroupModalMode(null)}
          onSubmit={async (name, icon) => {
            await handleRenameGroup(groupModalMode.group.id, { name, icon });
            setGroupModalMode(null);
          }}
        />
      )}
      {groupToDelete && (
        <DeleteGroupModal
          group={groupToDelete}
          onCancel={() => setGroupToDelete(null)}
          onConfirm={async () => {
            await handleDeleteGroup(groupToDelete.id);
            setGroupToDelete(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Project Row ──────────────────────────────────────────────────────────────

interface RowProps {
  project: Project;
  isLast: boolean;
  groups: GroupWithCount[];
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onMove: (groupId: string | null) => void;
}

function ProjectRow({ project, isLast, groups, onOpen, onDelete, onDuplicate, onRename, onMove }: RowProps) {
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close move-to menu on outside click
  useEffect(() => {
    if (!moveMenuOpen) return;
    function handler(ev: MouseEvent) {
      if (moveMenuRef.current && !moveMenuRef.current.contains(ev.target as Node)) {
        setMoveMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moveMenuOpen]);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setNameInput(project.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    setRenaming(false);
    onRename(nameInput);
  }

  function cancelRename() {
    setRenaming(false);
    setNameInput(project.name);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  async function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    setDuplicating(true);
    try { await onDuplicate(); } finally { setDuplicating(false); }
  }

  const statusColors = ['bg-tertiary', 'bg-primary', 'bg-on-surface-variant', 'bg-error'];
  const dotColor = statusColors[project.id.charCodeAt(0) % statusColors.length];

  return (
    <div
      onClick={renaming ? undefined : onOpen}
      className={`grid grid-cols-12 px-6 py-5 hover:bg-surface-bright/30 transition-colors ${!renaming ? 'cursor-pointer' : ''} items-center group ${!isLast ? 'border-b border-outline-variant/5' : ''}`}
    >
      <div className="col-span-5 flex items-center gap-4">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={inputRef}
              className="bg-surface-container-low border border-primary/50 rounded px-2 py-0.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-xs"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="font-bold text-sm truncate">{project.name}</div>
          )}
          <div className="text-[10px] text-on-surface-variant font-label mt-0.5">
            ID: {project.id.slice(0, 12)}
          </div>
        </div>
      </div>

      <div className="col-span-2 flex justify-center">
        <span className="px-3 py-1 bg-surface-variant rounded text-[11px] font-label text-on-surface">
          {project.tables.length} TABLE{project.tables.length !== 1 ? 'S' : ''}
        </span>
      </div>

      <div className="col-span-3 text-right text-on-surface-variant text-[11px] font-label">
        {new Date(project.updatedAt).toLocaleDateString()}
      </div>

      <div className="col-span-2 flex items-center justify-end gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="flex items-center gap-1 text-[11px] font-label text-primary hover:underline uppercase tracking-widest"
        >
          Open
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>

        {/* Rename */}
        <button
          onClick={startRename}
          title="Rename"
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>

        {/* Duplicate */}
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          title="Duplicate"
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-primary transition-all"
        >
          {duplicating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <span className="material-symbols-outlined text-[16px]">content_copy</span>
          }
        </button>

        {/* Move to group */}
        <div className="relative" ref={moveMenuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMoveMenuOpen(o => !o); }}
            title="Move to group"
            className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {moveMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-surface-container-high border border-outline-variant/30 rounded-md shadow-lg py-1"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-on-surface-variant font-label">Move to group</div>
              <button
                onClick={() => { setMoveMenuOpen(false); if (project.groupId) onMove(null); }}
                disabled={!project.groupId}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-bright disabled:opacity-40 disabled:cursor-default flex items-center gap-2"
              >
                <Folder className="w-3.5 h-3.5 text-on-surface-variant" />
                <span>(Uncategorized)</span>
                {!project.groupId && <span className="ml-auto text-[10px] text-on-surface-variant">current</span>}
              </button>
              {groups.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-on-surface-variant italic">No groups yet</div>
              )}
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => { setMoveMenuOpen(false); if (project.groupId !== g.id) onMove(g.id); }}
                  disabled={project.groupId === g.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-bright disabled:opacity-40 disabled:cursor-default flex items-center gap-2"
                >
                  {renderGroupIcon(g.icon)}
                  <span className="truncate">{g.name}</span>
                  {project.groupId === g.id && <span className="ml-auto text-[10px] text-on-surface-variant">current</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-error transition-all"
        >
          {deleting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <span className="material-symbols-outlined text-[18px]">delete</span>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ModalProps {
  mode: 'manual' | 'prisma' | 'sql' | 'csv' | 'er';
  groups: GroupWithCount[];
  onClose: () => void;
  onCreated: (project: Project) => void;
}

interface SqlPreview {
  projectName: string;
  tables: DatasetSchema[];
  warnings: string[];
  fkCandidates: FkCandidate[];
}

function candidateKey(c: FkCandidate): string {
  return `${c.fromTable}.${c.fromColumn}→${c.toTable}.${c.toColumn}`;
}

function applyFkCandidates(tables: DatasetSchema[], candidates: FkCandidate[]): DatasetSchema[] {
  return tables.map((table) => {
    const applicable = candidates.filter((c) => c.fromTable === table.name);
    if (applicable.length === 0) return table;
    return {
      ...table,
      columns: table.columns.map((col) => {
        const match = applicable.find((c) => c.fromColumn === col.name);
        if (!match) return col;
        return {
          ...col,
          indexType: 'foreign_key' as const,
          generatorConfig: { ...col.generatorConfig, poolRef: `${match.toTable}.${match.toColumn}` },
        };
      }),
    };
  });
}

function ImportModal({ mode, groups, onClose, onCreated }: ModalProps) {
  const [projectName, setProjectName] = useState('');
  const [source, setSource] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  // SQL two-step preview
  const [sqlPreview, setSqlPreview] = useState<SqlPreview | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());

  // Modes that load file contents into the textarea (vs CSV which keeps the File object)
  const isTextSource = mode === 'prisma' || mode === 'sql' || mode === 'er';

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (isTextSource) {
      const reader = new FileReader();
      reader.onload = () => {
        setSource(typeof reader.result === 'string' ? reader.result : '');
        if (!projectName) {
          setProjectName(file.name.replace(/\.(json|prisma|sql|txt)$/i, ''));
        }
      };
      reader.readAsText(file);
    } else {
      setCsvFile(file);
      if (!projectName) setProjectName(file.name.replace(/\.csv$/i, ''));
    }
  }, [projectName, isTextSource]);

  const dropzoneAccept: Record<string, string[]> =
    mode === 'er'     ? { 'application/json': ['.json'], 'text/plain': ['.json', '.txt'] } :
    mode === 'prisma' ? { 'text/plain': ['.prisma', '.txt'] } :
    mode === 'sql'    ? { 'application/sql': ['.sql'], 'text/plain': ['.sql', '.txt'] } :
                        { 'text/csv': ['.csv'], 'text/plain': ['.txt'] };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: dropzoneAccept,
    maxFiles: 1,
    disabled: loading,
  });

  const title =
    mode === 'manual' ? 'New Project' :
    mode === 'prisma' ? 'Import Prisma Schema' :
    mode === 'sql' ? 'Import SQL DDL' :
    mode === 'er' ? 'Import ER JSON' :
    'Import CSV';

  const subtitle =
    mode === 'manual' ? 'Create empty project' :
    mode === 'csv' ? 'Infer schema from CSV file' :
    mode === 'er' ? 'Parse ER schema JSON & initialize tables' :
    'Parse schema & initialize tables';

  async function handleSubmit() {
    if (!projectName.trim()) { setError('Project name is required'); return; }
    if (mode === 'csv' && !csvFile) { setError('Please select a CSV file'); return; }
    if (mode === 'er' && !source.trim()) { setError('Please paste or upload an ER JSON document'); return; }

    // SQL: two-step — first parse & preview, then create
    if (mode === 'sql' && !sqlPreview) {
      if (!source.trim()) { setError('Please paste or upload SQL DDL'); return; }
      setLoading(true);
      setError(null);
      setWarnings([]);
      try {
        const preview = await previewProjectFromSql(source, projectName.trim());
        if (!projectName.trim() && preview.projectName) setProjectName(preview.projectName);
        setSqlPreview(preview);
        // Pre-select all high-confidence candidates (>= 0.75)
        setSelectedCandidates(
          new Set(preview.fkCandidates.filter((c) => c.confidence >= 0.75).map(candidateKey)),
        );
        if (preview.warnings.length > 0) setWarnings(preview.warnings);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let project: Project;
      if (mode === 'manual') {
        project = await createProject(projectName.trim(), [], groupId);
      } else if (mode === 'prisma') {
        project = await inferFromPrisma(source, projectName.trim());
      } else if (mode === 'sql' && sqlPreview) {
        // Apply selected FK candidates to the previewed tables
        const chosenCandidates = sqlPreview.fkCandidates.filter((c) => selectedCandidates.has(candidateKey(c)));
        const tables = applyFkCandidates(sqlPreview.tables, chosenCandidates);
        project = await createProject(projectName.trim(), tables, groupId);
      } else if (mode === 'sql') {
        // Fallback: no preview (should not happen)
        project = await inferProjectFromSql(source, projectName.trim());
      } else if (mode === 'er') {
        const result = await inferProjectFromEr(source, projectName.trim());
        project = result.project;
        if (result.warnings.length > 0) setWarnings(result.warnings);
      } else {
        // CSV: infer single-table schema, wrap in a project
        const result = await inferFromCsv(csvFile!);
        const now = new Date().toISOString();
        const table = {
          id: nanoid(),
          name: projectName.trim().replace(/\s+/g, '_').toLowerCase(),
          columns: result.columns.map((c) => ({ ...c, id: nanoid() })),
          rules: [],
          sourceType: 'upload' as const,
          createdAt: now,
          updatedAt: now,
        };
        project = await createProject(projectName.trim(), [table], groupId);
      }
      // Infer endpoints (prisma/er) don't accept groupId; apply it after.
      if (groupId && project.groupId !== groupId) {
        project = await moveProjectToGroup(project.id, groupId);
      }
      onCreated(project);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-container border border-outline-variant/30 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <div>
            <h2 className="font-headline font-bold">{title}</h2>
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mt-0.5">
              {subtitle}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg px-3 py-2 text-sm text-error font-label">
              {error}
            </div>
          )}
          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
              Project Name
            </label>
            <input
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-on-surface placeholder:text-on-surface-variant/50"
              placeholder="e.g. customer_loyalty_v2"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mode === 'manual' && handleSubmit()}
              autoFocus
            />
          </div>

          <GroupSelect groups={groups} value={groupId} onChange={setGroupId} />


          {isTextSource && (() => {
            const config = {
              prisma: {
                label:        'Prisma Schema',
                fileHint:     'Drag & drop a .prisma file — or paste the contents below',
                dropMsg:      'Drop Prisma schema here',
                placeholder:  'Paste your .prisma schema here...',
                textareaCls:  'text-sm font-label',
              },
              sql: {
                label:        'SQL DDL',
                fileHint:     'Drag & drop a .sql file — or paste the contents below',
                dropMsg:      'Drop SQL file here',
                placeholder:  'Paste your CREATE TABLE SQL here...',
                textareaCls:  'text-sm font-label',
              },
              er: {
                label:        'ER Schema JSON',
                fileHint:     'Drag & drop a .json file — or paste the contents below',
                dropMsg:      'Drop JSON here',
                placeholder:  '{\n  "database": "MyDB",\n  "tables": {\n    "Users": {\n      "columns": {\n        "Id": { "type": "uuid", "nullable": false, "is_primary_key": true }\n      },\n      "primary_key": ["Id"]\n    }\n  },\n  "relationships": []\n}',
                textareaCls:  'text-xs font-mono',
              },
            }[mode as 'prisma' | 'sql' | 'er'];

            return (
              <div className="space-y-3">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-tertiary bg-tertiary/5'
                      : source
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-outline-variant/40 hover:border-primary/50'
                  } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p className="text-tertiary font-label text-[11px] uppercase tracking-widest">{config.dropMsg}</p>
                  ) : (
                    <p className="text-[11px] font-label text-on-surface-variant uppercase tracking-widest">
                      {config.fileHint}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
                    {config.label}
                  </label>
                  <textarea
                    className={`w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 ${config.textareaCls} focus:outline-none focus:ring-1 focus:ring-primary resize-none text-on-surface placeholder:text-on-surface-variant/50`}
                    placeholder={config.placeholder}
                    rows={10}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </div>
              </div>
            );
          })()}

          {warnings.length > 0 && (
            <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-3 py-2 text-xs text-on-surface space-y-1 max-h-40 overflow-auto">
              <p className="font-label uppercase tracking-widest text-[10px] text-tertiary mb-1">
                Parser warnings
              </p>
              {warnings.map((w, i) => <p key={i}>• {w}</p>)}
            </div>
          )}

          {/* SQL FK review step */}
          {mode === 'sql' && sqlPreview && (
            <div className="space-y-3">
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-xs">
                <p className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">
                  Tables detected
                </p>
                <p className="text-on-surface font-mono">
                  {sqlPreview.tables.map((t) => t.name).join(', ')}
                </p>
              </div>

              {sqlPreview.fkCandidates.length > 0 ? (
                <div className="border border-outline-variant/30 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
                    <p className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant">
                      Detected FK relationships
                    </p>
                    <div className="flex gap-3 text-[10px]">
                      <button
                        className="text-primary hover:underline"
                        onClick={() => setSelectedCandidates(new Set(sqlPreview.fkCandidates.map(candidateKey)))}
                      >
                        All
                      </button>
                      <button
                        className="text-on-surface-variant hover:underline"
                        onClick={() => setSelectedCandidates(new Set())}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-outline-variant/10">
                    {sqlPreview.fkCandidates.map((c) => {
                      const key = candidateKey(c);
                      const checked = selectedCandidates.has(key);
                      const pct = Math.round(c.confidence * 100);
                      const badgeColor =
                        pct >= 80 ? 'bg-emerald-500/15 text-emerald-600' :
                        pct >= 60 ? 'bg-amber-500/15 text-amber-600' :
                                    'bg-error/10 text-error';
                      return (
                        <label
                          key={key}
                          className="flex items-start gap-3 px-3 py-2 hover:bg-surface-container/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={checked}
                            onChange={() => {
                              setSelectedCandidates((prev) => {
                                const next = new Set(prev);
                                next.has(key) ? next.delete(key) : next.add(key);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-xs text-on-surface truncate">
                              <span className="text-blue-400">{c.fromTable}.{c.fromColumn}</span>
                              {' → '}
                              <span className="text-yellow-400">{c.toTable}.{c.toColumn}</span>
                            </p>
                            <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
                              {c.reasons.join(' · ')}
                            </p>
                          </div>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
                            {pct}%
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant italic">No FK relationships detected — you can draw them manually in the diagram editor.</p>
              )}
            </div>
          )}

          {mode === 'csv' && (
            <div>
              <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
                CSV File
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-tertiary bg-tertiary/5'
                    : csvFile
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-outline-variant/40 hover:border-primary/50'
                } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input {...getInputProps()} />
                {csvFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-primary text-2xl">table_view</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-on-surface">{csvFile.name}</div>
                      <div className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest mt-0.5">
                        {(csvFile.size / 1024).toFixed(1)} KB — Click to change
                      </div>
                    </div>
                  </div>
                ) : isDragActive ? (
                  <p className="text-tertiary font-label text-[11px] uppercase tracking-widest">Drop CSV here</p>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-on-surface-variant/50" />
                    <p className="text-sm text-on-surface-variant mb-1">Drag & drop a CSV file</p>
                    <p className="text-[10px] font-label text-on-surface-variant/60 uppercase tracking-widest">or click to browse</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          {mode === 'sql' && sqlPreview ? (
            <button
              onClick={() => { setSqlPreview(null); setSelectedCandidates(new Set()); setWarnings([]); }}
              className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg transition-colors font-label uppercase tracking-widest text-[11px]"
            >
              ← Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg transition-colors font-label uppercase tracking-widest text-[11px]"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !projectName.trim() || (mode === 'csv' && !csvFile) || (mode === 'er' && !source.trim()) || (mode === 'sql' && !sqlPreview && !source.trim())}
            className="flex items-center gap-2 bg-primary text-on-primary-fixed px-5 py-2.5 rounded-lg text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all font-headline"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'manual' ? 'Create Project' :
             mode === 'sql' && !sqlPreview ? 'Parse & Preview' :
             mode === 'sql' && sqlPreview ? 'Create Project' :
             'Parse & Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Modal ───────────────────────────────────────────────────────────

interface TemplateModalProps {
  groups: GroupWithCount[];
  onClose: () => void;
  onCreated: (project: Project) => void;
}

function TemplateModal({ groups, onClose, onCreated }: TemplateModalProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    listTemplates().then(setTemplates).catch((e: Error) => setError(e.message));
  }, []);

  // Default project name to template name when one is picked
  useEffect(() => {
    if (selectedId && !projectName.trim()) {
      const tpl = templates.find(t => t.id === selectedId);
      if (tpl) setProjectName(tpl.name.toLowerCase().replace(/\s+/g, '_'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleSubmit() {
    if (!selectedId || !projectName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      let project = await createFromTemplate(selectedId, projectName.trim());
      if (groupId) {
        project = await moveProjectToGroup(project.id, groupId);
      }
      onCreated(project);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-container border border-outline-variant/30 rounded-xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <div>
            <h2 className="font-headline font-bold">Create from Template</h2>
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mt-0.5">
              Pick a domain bundle to seed a multi-table project
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg px-3 py-2 text-sm text-error font-label">
              {error}
            </div>
          )}

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  selectedId === t.id
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/20 hover:border-primary/40 bg-surface-container-low'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-headline font-bold">{t.name}</h3>
                  <span className="px-2 py-0.5 bg-surface-variant rounded text-[10px] font-label text-on-surface">
                    {t.tableCount} tables
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">{t.description}</p>
              </button>
            ))}
            {templates.length === 0 && !error && (
              <div className="text-center py-8 text-on-surface-variant text-sm">Loading templates…</div>
            )}
          </div>

          {selectedId && (
            <>
              <div>
                <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
                  Project Name
                </label>
                <input
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-on-surface placeholder:text-on-surface-variant/50"
                  placeholder="e.g. demo_ecommerce"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoFocus
                />
              </div>
              <div className="mt-4">
                <GroupSelect groups={groups} value={groupId} onChange={setGroupId} />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg transition-colors font-label uppercase tracking-widest text-[11px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedId || !projectName.trim() || loading}
            className="flex items-center gap-2 bg-primary text-on-primary-fixed px-5 py-2.5 rounded-lg text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all font-headline"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Section ─────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: GroupWithCount | null;     // null = Uncategorized bucket
  projects: Project[];
  groups: GroupWithCount[];
  onRenameGroup?: () => void;
  onDeleteGroup?: () => void;
  onOpen: (project: Project) => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onMove: (projectId: string, groupId: string | null) => Promise<void>;
}

function GroupSection({ group, projects, groups, onRenameGroup, onDeleteGroup, onOpen, onDelete, onDuplicate, onRename, onMove }: GroupSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const collapseKey = `synthetic.group-collapsed.${group?.id ?? '__uncategorized__'}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(collapseKey) === '1'; } catch { return false; }
  });
  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(collapseKey, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handler(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const isUncategorized = group === null;
  const headerIcon = isUncategorized
    ? <Folder className="w-4 h-4 text-on-surface-variant" />
    : renderGroupIcon(group.icon);
  const headerName = isUncategorized ? 'Uncategorized' : group.name;

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
      <div
        className="flex items-center justify-between px-6 py-3 bg-surface-container-high border-b border-outline-variant/10 cursor-pointer hover:bg-surface-bright/30 transition-colors"
        onClick={toggleCollapsed}
        role="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${headerName} folder`}
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`w-4 h-4 text-on-surface-variant transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
          />
          {headerIcon}
          <h3 className="font-headline text-sm font-bold">{headerName}</h3>
          <span className="px-2 py-0.5 bg-surface-container-highest rounded font-label text-[10px] text-on-surface-variant">
            {projects.length.toString().padStart(2, '0')}
          </span>
        </div>
        {!isUncategorized && (onRenameGroup || onDeleteGroup) && (
          <div className="relative" ref={menuRef} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1 text-on-surface-variant hover:text-on-surface transition-colors"
              title="Group actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] bg-surface-container-high border border-outline-variant/30 rounded-md shadow-lg py-1">
                {onRenameGroup && (
                  <button
                    onClick={() => { setMenuOpen(false); onRenameGroup(); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-bright"
                  >
                    Rename
                  </button>
                )}
                {onDeleteGroup && (
                  <button
                    onClick={() => { setMenuOpen(false); onDeleteGroup(); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-bright text-error"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {collapsed ? null : projects.length === 0 ? (
        <div className="px-6 py-6 text-[11px] font-label uppercase tracking-widest text-on-surface-variant/60 italic">
          {isUncategorized ? 'No uncategorized projects' : 'Empty group — move projects here using the row menu'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-12 px-6 py-3 border-b border-outline-variant/10 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
              <div className="col-span-5">Project Name</div>
              <div className="col-span-2 text-center">Tables</div>
              <div className="col-span-3 text-right">Last Sync</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {projects.map((project, i) => (
              <ProjectRow
                key={project.id}
                project={project}
                isLast={i === projects.length - 1}
                groups={groups}
                onOpen={() => onOpen(project)}
                onDelete={() => onDelete(project.id)}
                onDuplicate={() => onDuplicate(project.id)}
                onRename={(name) => onRename(project.id, name)}
                onMove={(gid) => onMove(project.id, gid)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Flat search-result table ─────────────────────────────────────────────────

interface FlatProjectTableProps {
  projects: Project[];
  groups: GroupWithCount[];
  totalFiltered: number;
  page: number;
  totalPages: number;
  searchQuery: string;
  onPageChange: (p: number) => void;
  onClearSearch: () => void;
  onOpen: (project: Project) => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onMove: (projectId: string, groupId: string | null) => Promise<void>;
}

function FlatProjectTable({ projects, groups, totalFiltered, page, totalPages, searchQuery, onPageChange, onClearSearch, onOpen, onDelete, onDuplicate, onRename, onMove }: FlatProjectTableProps) {
  return (
    <>
      <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 block mb-3">folder_open</span>
            <p className="text-sm font-label uppercase tracking-widest text-on-surface-variant/60">No projects match "{searchQuery}"</p>
            <button
              onClick={onClearSearch}
              className="mt-3 text-[10px] font-label uppercase tracking-widest text-primary hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-12 px-6 py-4 bg-surface-container-high border-b border-outline-variant/10 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
                <div className="col-span-5">Project Name</div>
                <div className="col-span-2 text-center">Tables</div>
                <div className="col-span-3 text-right">Last Sync</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {projects.map((project, i) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isLast={i === projects.length - 1}
                  groups={groups}
                  onOpen={() => onOpen(project)}
                  onDelete={() => onDelete(project.id)}
                  onDuplicate={() => onDuplicate(project.id)}
                  onRename={(name) => onRename(project.id, name)}
                  onMove={(gid) => onMove(project.id, gid)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 px-1">
          <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalFiltered)} of {totalFiltered}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 bg-surface-container border border-outline-variant/20 rounded font-label text-[10px] uppercase tracking-widest text-on-surface hover:bg-surface-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 bg-surface-container border border-outline-variant/20 rounded font-label text-[10px] uppercase tracking-widest text-on-surface hover:bg-surface-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Group create / rename modal ──────────────────────────────────────────────

interface GroupModalProps {
  mode: 'create' | 'rename';
  initial?: { name: string; icon: string };
  onClose: () => void;
  onSubmit: (name: string, icon: string) => Promise<void>;
}

function GroupModal({ mode, initial, onClose, onSubmit }: GroupModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '📁');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!icon.trim()) { setError('Icon is required'); return; }
    setLoading(true);
    setError(null);
    try { await onSubmit(name.trim(), icon.trim()); } catch (e) { setError((e as Error).message); setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface-container rounded-xl border border-outline-variant/20 w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="font-headline text-xl font-bold mb-1">{mode === 'create' ? 'New Group' : 'Rename Group'}</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          {mode === 'create' ? 'Create a workspace to organize related projects.' : 'Update the group name or icon.'}
        </p>
        <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. Customer X"
        />
        <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Icon</label>
        <input
          value={icon}
          onChange={e => setIcon(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Emoji like 📁 or short name like folder"
        />
        <p className="text-[10px] text-on-surface-variant mb-4">
          Preview: <span className="inline-flex items-center gap-1 ml-1">{renderGroupIcon(icon)}<span className="text-on-surface">{name || '(group)'}</span></span>
        </p>
        {error && <div className="mb-3 text-sm text-error font-label">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-5 py-2 bg-primary text-on-primary-fixed font-headline font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete group confirm modal ───────────────────────────────────────────────

interface DeleteGroupModalProps {
  group: GroupWithCount;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteGroupModal({ group, onCancel, onConfirm }: DeleteGroupModalProps) {
  const [loading, setLoading] = useState(false);
  async function confirm() {
    setLoading(true);
    try { await onConfirm(); } catch { setLoading(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={onCancel}>
      <div className="bg-surface-container rounded-xl border border-outline-variant/20 w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="font-headline text-xl font-bold mb-3">Delete group "{group.name}"?</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          {group.projectCount === 0
            ? 'This group is empty and will be removed.'
            : `${group.projectCount} project${group.projectCount !== 1 ? 's' : ''} will be moved to Uncategorized. No project data is deleted.`}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={loading}
            className="px-5 py-2 bg-error text-on-error font-headline font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group select dropdown (reusable in create modals) ────────────────────────

interface GroupSelectProps {
  groups: GroupWithCount[];
  value: string | null;
  onChange: (groupId: string | null) => void;
}

function GroupSelect({ groups, value, onChange }: GroupSelectProps) {
  return (
    <div>
      <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
        Folder
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-on-surface"
      >
        <option value="">(Uncategorized)</option>
        {groups.map(g => (
          <option key={g.id} value={g.id}>
            {g.icon} {g.name}
          </option>
        ))}
      </select>
      {groups.length === 0 && (
        <p className="mt-1 text-[10px] text-on-surface-variant/70 italic">
          No folders yet — create one from the home page.
        </p>
      )}
    </div>
  );
}
