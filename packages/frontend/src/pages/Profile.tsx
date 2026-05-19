import { useState } from 'react';
import { Sidebar } from '../components/layout/Sidebar.js';

const INSTANCE_ID = 'UX-SYNTH-001-LOCAL';

function useSetting(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const stored = localStorage.getItem(key);
  const [value, setValue] = useState<boolean>(stored !== null ? stored === 'true' : defaultValue);
  function set(v: boolean) {
    localStorage.setItem(key, String(v));
    setValue(v);
  }
  return [value, set];
}

function useLightTheme(): [boolean, (v: boolean) => void] {
  const [light, setLight] = useState<boolean>(() => document.documentElement.classList.contains('light'));
  function set(v: boolean) {
    if (v) {
      document.documentElement.classList.add('light');
      localStorage.setItem('pref_theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('pref_theme', 'dark');
    }
    setLight(v);
  }
  return [light, set];
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function Profile() {
  const [lightMode, setLightMode] = useLightTheme();
  const [alertPulse, setAlertPulse] = useSetting('pref_alertPulse', false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('pref_apiKey') ?? `sk_live_${randomHex(8)}`;
  });
  const [keyJustRotated, setKeyJustRotated] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleCopyId() {
    navigator.clipboard.writeText(INSTANCE_ID).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleGenerateKey() {
    const next = `sk_live_${randomHex(8)}`;
    localStorage.setItem('pref_apiKey', next);
    setApiKey(next);
    setKeyJustRotated(true);
    setTimeout(() => setKeyJustRotated(false), 2000);
  }

  function handleExportLogs() {
    const config: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pref_')) {
        config[k] = localStorage.getItem(k) ?? '';
      }
    }
    const payload = {
      instanceId: INSTANCE_ID,
      exportedAt: new Date().toISOString(),
      preferences: config,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthetic-studio-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleTerminateSession() {
    if (!confirm('Clear all preferences and reload? Light mode, alert pulse, and the rotated API key will be reset.')) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pref_')) localStorage.removeItem(k);
    }
    document.documentElement.classList.remove('light');
    location.reload();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen overflow-y-auto">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-4 md:px-8 pl-14 md:pl-8 w-full h-16 sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-surface-container shrink-0">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
              <input
                className="bg-surface-container-low border-none rounded-md py-2 pl-10 pr-4 text-sm w-full focus:ring-1 focus:ring-tertiary placeholder:text-on-surface-variant/50 font-body outline-none"
                placeholder="Search architecture, nodes, or protocols..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-8">
            <span className="font-label text-[10px] uppercase tracking-tighter text-on-surface-variant">
              Status: <span className="text-tertiary">Online</span>
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="p-8 max-w-7xl mx-auto w-full space-y-12 pb-24">
          {/* Profile Hero */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant/10 pb-12">
            <div className="flex items-start gap-8">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-tertiary rounded-full blur opacity-20 group-hover:opacity-40 transition duration-700" />
                <div className="relative w-28 h-28 rounded-full border-2 border-surface-container-high bg-surface-container flex items-center justify-center shadow-2xl">
                  <span className="material-symbols-outlined text-[56px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                </div>
                <button className="absolute bottom-1 right-1 bg-surface-bright p-1.5 rounded-full border border-outline-variant hover:border-primary transition-all">
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                </button>
              </div>
              <div className="space-y-1 pt-2">
                <h1 className="text-4xl font-bold font-headline tracking-tight">Admin_01</h1>
                <p className="text-primary font-medium flex items-center gap-2 text-sm">
                  <span className="material-symbols-outlined text-lg">verified_user</span>
                  Lead Data Architect
                </p>
                <div className="flex gap-3 mt-4">
                  <span className="px-3 py-1 bg-surface-container rounded font-label text-[10px] uppercase tracking-widest text-on-surface-variant border border-outline-variant/10">
                    Level 4 Access
                  </span>
                  <span className="px-3 py-1 bg-surface-container rounded font-label text-[10px] uppercase tracking-widest text-on-surface-variant border border-outline-variant/10">
                    System Root
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary-fixed font-bold rounded-md hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                {saved ? 'check' : 'save'}
              </span>
              {saved ? 'SAVED' : 'COMMIT CHANGES'}
            </button>
          </section>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Account Info */}
            <section className="lg:col-span-4 bg-surface-container border border-outline-variant/20 rounded-xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover:opacity-10 transition-opacity">
                <span className="material-symbols-outlined text-[120px]">hub</span>
              </div>
              <h2 className="font-headline text-xl font-bold mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">analytics</span>
                Account Synthesis
              </h2>
              <div className="space-y-6">
                <div>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Internal ID</p>
                  <div className="bg-surface-container-low px-4 py-3 rounded border border-outline-variant/10 font-label text-sm text-tertiary flex justify-between items-center">
                    <span>{INSTANCE_ID}</span>
                    <button onClick={handleCopyId} title="Copy ID" className="hover:text-on-surface transition-colors">
                      <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                    </button>
                  </div>
                </div>
                <div>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Primary Node</p>
                  <div className="bg-surface-container-low px-4 py-3 rounded border border-outline-variant/10 font-label text-sm flex justify-between items-center">
                    <span>localhost:3001</span>
                    <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                  </div>
                </div>
                <div className="pt-4 mt-4 border-t border-outline-variant/10">
                  <div className="flex justify-between items-center text-xs font-label">
                    <span className="text-on-surface-variant">Last Active</span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Auth Matrix */}
            <section className="lg:col-span-8 bg-surface-container border border-outline-variant/20 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline text-xl font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">security</span>
                  Auth Matrix
                </h2>
                <button
                  onClick={handleGenerateKey}
                  className="text-[10px] font-label uppercase tracking-widest text-primary hover:underline transition-all"
                >
                  {keyJustRotated ? 'Rotated ✓' : 'Generate New Key'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                      <th className="pb-3 px-2">Matrix Key</th>
                      <th className="pb-3 px-2">Scope</th>
                      <th className="pb-3 px-2">Status</th>
                      <th className="pb-3 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    <tr>
                      <td className="py-4 px-2">
                        <code className="font-label text-sm text-on-surface">{apiKey}</code>
                      </td>
                      <td className="py-4 px-2">
                        <span className="px-2 py-0.5 bg-surface-container-highest rounded text-[10px] font-label text-on-surface-variant">Full_Write</span>
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-label text-tertiary uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Active
                        </div>
                      </td>
                      <td className="py-4 px-2 text-right">
                        <button className="p-1 hover:text-error transition-colors text-on-surface-variant">
                          <span className="material-symbols-outlined text-lg">cancel</span>
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 px-2">
                        <code className="font-label text-sm text-on-surface-variant/60">sk_test_...dev2</code>
                      </td>
                      <td className="py-4 px-2">
                        <span className="px-2 py-0.5 bg-surface-container-highest rounded text-[10px] font-label text-on-surface-variant">Read_Only</span>
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-label text-on-surface-variant uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" /> Revoked
                        </div>
                      </td>
                      <td className="py-4 px-2 text-right">
                        <button className="p-1 text-on-surface-variant/20 cursor-not-allowed">
                          <span className="material-symbols-outlined text-lg">restore</span>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Protocol Config */}
            <section className="lg:col-span-12 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-3 bg-surface-container border border-outline-variant/20 rounded-xl p-8">
                <h2 className="font-headline text-xl font-bold mb-8 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">settings_input_component</span>
                  Protocol Config
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  {/* Light Mode */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/10 rounded-lg hover:border-primary/30 transition-all group">
                    <div className="space-y-1">
                      <p className="font-headline font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">{lightMode ? 'light_mode' : 'dark_mode'}</span>
                        Light Mode
                      </p>
                      <p className="text-xs text-on-surface-variant">Switch the interface between dark and light theme.</p>
                    </div>
                    <button
                      onClick={() => setLightMode(!lightMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${lightMode ? 'bg-primary' : 'bg-surface-variant'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${lightMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Alert Pulse */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/10 rounded-lg hover:border-tertiary/30 transition-all group">
                    <div className="space-y-1">
                      <p className="font-headline font-semibold text-sm group-hover:text-tertiary transition-colors">Alert Pulse</p>
                      <p className="text-xs text-on-surface-variant">Real-time notifications for synthesis events.</p>
                    </div>
                    <button
                      onClick={() => setAlertPulse(!alertPulse)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${alertPulse ? 'bg-tertiary' : 'bg-surface-variant'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${alertPulse ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* 2FA */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/10 rounded-lg">
                    <div className="space-y-1">
                      <p className="font-headline font-semibold text-sm">2FA Protocol</p>
                      <p className="text-xs text-tertiary">ENABLED - Biometric Node</p>
                    </div>
                    <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  </div>

                  {/* Language */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/10 rounded-lg">
                    <div className="space-y-1">
                      <p className="font-headline font-semibold text-sm">Language Engine</p>
                      <p className="text-xs text-on-surface-variant">System-wide display language.</p>
                    </div>
                    <select className="bg-surface-container-highest border-none text-[10px] font-label uppercase rounded px-3 py-1 text-on-surface focus:ring-1 focus:ring-primary outline-none">
                      <option>EN-US (Standard)</option>
                      <option>JP-TOK (Synthetic)</option>
                      <option>DE-BER (Terminal)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="md:col-span-1 flex flex-col gap-6">
                <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 bg-surface-container-highest rounded-full flex items-center justify-center border border-outline-variant/30">
                    <span className="material-symbols-outlined text-primary">rocket_launch</span>
                  </div>
                  <h3 className="font-headline font-bold">Quick Export</h3>
                  <p className="text-xs text-on-surface-variant">Download all configuration logs for audit.</p>
                  <button
                    onClick={handleExportLogs}
                    className="w-full py-2 bg-surface-variant hover:bg-surface-bright rounded text-[10px] font-label uppercase tracking-widest transition-all"
                  >
                    Export Logs
                  </button>
                </div>
                <div className="bg-error-container/10 border border-error/20 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center border border-error/30">
                    <span className="material-symbols-outlined text-error">logout</span>
                  </div>
                  <h3 className="font-headline font-bold text-error">Terminal Lock</h3>
                  <p className="text-xs text-on-surface-variant">Terminate all active session tokens.</p>
                  <button
                    onClick={handleTerminateSession}
                    className="w-full py-2 bg-error hover:brightness-110 text-on-primary-fixed rounded text-[10px] font-label uppercase tracking-widest transition-all font-bold"
                  >
                    Terminate Session
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <footer className="flex flex-col md:flex-row justify-between items-center py-8 border-t border-outline-variant/10 gap-4">
            <div className="flex items-center gap-6">
              <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Synthetic Studio © 2025</span>
              <a href="#" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">Privacy Protocols</a>
              <a href="#" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">System Health</a>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tertiary" />
              <span className="text-[10px] font-label text-on-surface-variant">Multi-Cloud Sync Active</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
