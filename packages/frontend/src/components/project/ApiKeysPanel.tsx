import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, X, RefreshCw } from 'lucide-react';
import { listApiKeys, createApiKey, revokeApiKey } from '../../api/client.js';
import { useProjectStore } from '../../store/projectStore.js';
import type { ProjectApiKey } from '../../types/index.js';

export function ApiKeysPanel() {
  const { project } = useProjectStore();
  const projectId = project?.id ?? '';

  const [keys, setKeys] = useState<ProjectApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setKeys(await listApiKeys(projectId));
    } catch {
      setError('Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!projectId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createApiKey(projectId, newKeyName.trim() || 'Default');
      const { key, ...meta } = result;
      setKeys(prev => [meta, ...prev]);
      setRevealedKey(key);
      setNewKeyName('');
      setShowForm(false);
    } catch {
      setError('Failed to create API key.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevoking(keyId);
    setError(null);
    try {
      await revokeApiKey(projectId, keyId);
      setKeys(prev => prev.filter(k => k.id !== keyId));
    } catch {
      setError('Failed to revoke key.');
    } finally {
      setRevoking(null);
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const baseUrl = `${window.location.protocol}//${window.location.hostname}`;

  return (
    <div className="flex flex-col items-center p-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6 text-center">
        <Key className="w-10 h-10 mx-auto mb-3 text-primary" />
        <h2 className="text-xl font-bold">API Keys</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Generate keys to access your project data via the D1-compatible API
        </p>
      </div>

      <div className="w-full bg-card border border-border rounded-xl p-6 space-y-5">

        {/* Keys section */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            API Keys
          </label>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading…
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <Key className="w-8 h-8 opacity-20" />
              <p className="text-xs">No keys yet. Create one below.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div
                  key={k.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-background border border-border rounded-lg"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {k.keyPrefix}<span className="opacity-40">••••••••</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(k.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(k.id)}
                    disabled={revoking === k.id}
                    title="Revoke key"
                    className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                  >
                    {revoking === k.id
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create form (inline, revealed on button click) */}
        {showForm && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Key name <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. my-app"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {/* Revealed key (one-time) */}
        {revealedKey && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-yellow-500">
              Copy this key — it will not be shown again.
            </p>
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
              <span className="flex-1 font-mono text-xs truncate">{revealedKey}</span>
              <button
                onClick={() => copyToClipboard(revealedKey)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy"
              >
                {copied
                  ? <Check className="w-3.5 h-3.5 text-green-500" />
                  : <Copy className="w-3.5 h-3.5" />
                }
              </button>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" /> Dismiss
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {showForm ? (
            <>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {creating
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Creating…</>
                  : <><Key className="w-3.5 h-3.5" />Create Key</>
                }
              </button>
              <button
                onClick={() => { setShowForm(false); setNewKeyName(''); }}
                className="flex items-center gap-2 border border-border px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => { setShowForm(true); setError(null); setRevealedKey(null); }}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate API Key
            </button>
          )}
        </div>

        {/* Usage snippet — shown once a key exists */}
        {keys.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Usage
            </label>
            <pre className="bg-background border border-border rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto leading-relaxed">{`const db = new Database({
  fetch: (path, init) =>
    fetch(\`${baseUrl}/db/${projectId}\${path}\`, {
      ...init,
      headers: { ...init?.headers, Authorization: \`Bearer <your-key>\` },
    }),
});

const { results } = await db.prepare('SELECT * FROM "table" LIMIT 100').all();
await db.prepare('INSERT INTO "table" (col) VALUES (?)').bind('value').run();`}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
