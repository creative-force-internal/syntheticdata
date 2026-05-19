import { Sidebar } from '../components/layout/Sidebar.js';
import { useAppStore } from '../store/appStore.js';
import { ImportPanel } from '../components/import/ImportPanel.js';
import { SchemaEditor } from '../components/schema/SchemaEditor.js';
import { GeneratePanel } from '../components/generate/GeneratePanel.js';
import { ResultPanel } from '../components/preview/ResultPanel.js';

const STEP_LABELS = ['Import', 'Schema', 'Generate', 'Preview'];
const STEP_KEYS = ['import', 'schema', 'generate', 'preview'] as const;

export function SingleTablePage() {
  const { step } = useAppStore();
  const stepIndex = STEP_KEYS.indexOf(step);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />

      <div className="flex-1 md:ml-64 flex flex-col overflow-hidden">
        {/* Progress bar */}
        <div className="shrink-0 flex items-center gap-0 px-4 md:px-8 pl-14 md:pl-8 h-12 border-b border-surface-container bg-surface/95 overflow-x-auto">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-label font-bold transition-colors ${
                  i < stepIndex
                    ? 'bg-tertiary text-surface'
                    : i === stepIndex
                      ? 'bg-primary text-on-primary-fixed'
                      : 'bg-surface-container text-on-surface-variant border border-outline-variant/30'
                }`}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] font-label uppercase tracking-widest transition-colors ${
                  i === stepIndex ? 'text-on-surface font-bold' : 'text-on-surface-variant'
                }`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`w-12 h-px mx-3 transition-colors ${i < stepIndex ? 'bg-tertiary' : 'bg-outline-variant/30'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <main className="flex-1 overflow-auto">
          {step === 'import' && <ImportPanel />}
          {step === 'schema' && <SchemaEditor />}
          {step === 'generate' && <GeneratePanel />}
          {step === 'preview' && <ResultPanel />}
        </main>
      </div>
    </div>
  );
}
