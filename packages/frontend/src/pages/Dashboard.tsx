import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar.js';
import { listProjects, getStats } from '../api/client.js';
import type { Project } from '../types/index.js';

function formatRelative(iso: string | null): string {
  if (!iso) return 'No activity yet';
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalRowsGenerated, setTotalRowsGenerated] = useState<number | null>(null);
  const [totalJobsCompleted, setTotalJobsCompleted] = useState<number | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
    getStats().then(s => {
      setTotalRowsGenerated(s.totalRowsGenerated);
      setTotalJobsCompleted(s.totalJobsCompleted);
      setLastActivity(s.lastActivity);
    }).catch(() => {});
  }, []);

  // Refresh "X minutes ago" label every 30s without re-fetching
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const totalTables = projects.reduce((s, p) => s + p.tables.length, 0);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen overflow-hidden">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-4 md:px-8 pl-14 md:pl-8 w-full h-16 sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-surface-container shrink-0">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
              <input
                className="bg-surface-container-low border-none rounded-md py-2 pl-10 pr-4 text-sm w-full focus:ring-1 focus:ring-tertiary placeholder:text-on-surface-variant/50 font-body outline-none"
                placeholder="Search clusters, models, or datasets..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-8">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-label text-tertiary uppercase tracking-tighter">System Status</p>
              <p className="text-[10px] font-label text-on-surface">NOMINAL</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8">
          {/* Hero */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-4xl font-bold font-headline tracking-tight text-on-surface">System Overview</h2>
              <p className="text-on-surface-variant mt-2 max-w-lg text-sm">
                Synthetic Data Generation Engine is active.{' '}
                <span className="text-tertiary">{projects.length} project{projects.length !== 1 ? 's' : ''}</span> loaded across all clusters.
              </p>
            </div>
            <div className="px-6 py-3 bg-surface-container rounded-lg border border-outline-variant/10">
              <p className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">Last Generation</p>
              <p className="text-xl font-bold font-headline" title={lastActivity ?? ''}>{formatRelative(lastActivity)}</p>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-outlined text-6xl">database</span>
              </div>
              <p className="text-xs font-label text-primary uppercase tracking-widest mb-2">Total Projects</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-bold font-headline">{projects.length}</h3>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-label text-tertiary">
                <span className="material-symbols-outlined text-sm">folder_open</span>
                <span>ACTIVE SCHEMAS</span>
              </div>
            </div>

            <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-outlined text-6xl">account_tree</span>
              </div>
              <p className="text-xs font-label text-primary uppercase tracking-widest mb-2">Total Tables</p>
              <h3 className="text-4xl font-bold font-headline">{totalTables.toString().padStart(2, '0')}</h3>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-label text-on-surface-variant">
                <span>ACROSS ALL PROJECTS</span>
              </div>
            </div>

            <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-outlined text-6xl">data_table</span>
              </div>
              <p className="text-xs font-label text-primary uppercase tracking-widest mb-2">Rows Generated</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-bold font-headline">
                  {totalRowsGenerated === null
                    ? '—'
                    : totalRowsGenerated >= 1_000_000
                      ? `${(totalRowsGenerated / 1_000_000).toFixed(1)}M`
                      : totalRowsGenerated >= 1_000
                        ? `${(totalRowsGenerated / 1_000).toFixed(1)}K`
                        : totalRowsGenerated.toString()}
                </h3>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-label text-on-surface-variant">
                <span>{totalJobsCompleted ?? 0} COMPLETED JOB{totalJobsCompleted !== 1 ? 'S' : ''}</span>
              </div>
            </div>
          </div>

          {/* Recent Projects */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h4 className="text-xl font-bold font-headline flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">folder_open</span>
                  Recent Projects
                </h4>
                <span className="px-2 py-0.5 bg-surface-container-highest rounded font-label text-[10px] text-on-surface-variant">
                  {projects.length.toString().padStart(2, '0')} TOTAL
                </span>
              </div>
              <button
                onClick={() => navigate('/')}
                className="text-[10px] font-label text-primary hover:underline uppercase tracking-widest"
              >
                View All Projects
              </button>
            </div>

            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
              {projects.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant/30 block mb-3">folder_open</span>
                  <p className="text-on-surface-variant text-sm font-label uppercase tracking-widest mb-4">No projects yet</p>
                  <button
                    onClick={() => navigate('/')}
                    className="px-5 py-2.5 bg-primary text-on-primary-fixed font-headline font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 transition-all"
                  >
                    Create First Project
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-12 px-6 py-4 bg-surface-container-high border-b border-outline-variant/10 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
                      <div className="col-span-5">Project Name</div>
                      <div className="col-span-3 text-center">Tables</div>
                      <div className="col-span-4 text-right">Last Updated</div>
                    </div>
                    {projects.slice(0, 6).map((project, i) => (
                      <div
                        key={project.id}
                        onClick={() => navigate(`/projects/${project.id}/tables`)}
                        className={`grid grid-cols-12 px-6 py-5 hover:bg-surface-bright/30 transition-colors cursor-pointer items-center ${i < projects.slice(0, 6).length - 1 ? 'border-b border-outline-variant/5' : ''}`}
                      >
                        <div className="col-span-5 flex items-center gap-4">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <div>
                            <div className="font-bold text-sm">{project.name}</div>
                            <div className="text-[10px] text-on-surface-variant font-label mt-1">
                              ID: {project.id.slice(0, 12)}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <span className="px-3 py-1 bg-surface-variant rounded text-[11px] font-label text-on-surface">
                            {project.tables.length} TABLE{project.tables.length !== 1 ? 'S' : ''}
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-on-surface-variant text-[11px] font-label">
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="shrink-0 p-6 border-t border-surface-container flex justify-between items-center text-[10px] font-label tracking-widest text-on-surface-variant">
          <div className="flex gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tertiary" />
              API: CONNECTED
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tertiary" />
              ENGINE: SYNTH-CORE-B
            </span>
          </div>
          <div>© 2025 SYNTHETIC STUDIO — ALL RIGHTS RESERVED</div>
        </footer>
      </main>
    </div>
  );
}
