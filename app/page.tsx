'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import FileUpload from '@/components/FileUpload';
import ComparisonTable from '@/components/ComparisonTable';
import { HarAnalysis } from '@/types/har';
import { parseHarFile, analyzeHar, buildHarStore } from '@/utils/harParser';
import { saveHarStore, loadHarStore, clearHarStore } from '@/utils/storage';

export default function HomePage() {
  const [analyses, setAnalyses] = useState<HarAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadHarStore();
    if (stored?.analyses?.length) {
      setAnalyses(stored.analyses);
    }
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const startIndex = analyses.length;
      const newAnalyses: HarAnalysis[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const har = await parseHarFile(file);
        const analysis = analyzeHar(har, file.name, startIndex + i);
        newAnalyses.push(analysis);
      }

      const merged = [...analyses, ...newAnalyses];
      const store = buildHarStore(merged);
      saveHarStore(store);
      setAnalyses(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process files');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    clearHarStore();
    setAnalyses([]);
    setError(null);
  };

  const removeFile = (index: number) => {
    const updated = analyses
      .filter((_, i) => i !== index)
      .map((a, i) => ({ ...a, fileIndex: i, entries: a.entries.map((e) => ({ ...e, harFileIndex: i })) }));
    const store = buildHarStore(updated);
    saveHarStore(store);
    setAnalyses(updated);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h1 className="text-xl font-bold tracking-tight">HAR Analyzer</h1>
          </div>
          <div className="flex items-center gap-4">
            {analyses.length > 0 && (
              <button
                onClick={handleClear}
                className="text-sm text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear all
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Upload HAR Files</h2>
          <FileUpload onFilesSelected={handleFilesSelected} isLoading={isLoading} />
        </section>

        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/60 px-4 py-3 text-red-300 text-sm flex items-start gap-2">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Parsing HAR files...
          </div>
        )}

        {analyses.length > 0 && (
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-200">Loaded Files</h2>
                <span className="text-sm text-slate-500">{analyses.length} file{analyses.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {analyses.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm hover:border-blue-600 transition-colors">
                    <Link href={`/file/${i}`} className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-300 font-mono truncate max-w-[200px]" title={a.fileName}>{a.fileName}</span>
                      <span className="text-slate-500 text-xs shrink-0">{a.totalRequests.toLocaleString()} reqs</span>
                    </Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="text-slate-600 hover:text-red-400 transition-colors ml-1 shrink-0"
                      title="Remove file"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Comparison Summary</h2>
              <p className="text-sm text-slate-500 mb-4">
                Click on a status code, &quot;Unique URLs&quot;, or a content type to view detailed breakdowns.
              </p>
              <ComparisonTable analyses={analyses} />
            </section>
          </>
        )}

        {!analyses.length && !isLoading && (
          <div className="text-center py-16 text-slate-600">
            <p className="text-lg">Upload one or more HAR files to start analyzing</p>
            <p className="text-sm mt-2">HAR (HTTP Archive) files can be exported from browser DevTools</p>
          </div>
        )}
      </main>
    </div>
  );
}
