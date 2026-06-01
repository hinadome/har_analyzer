"use client";

import {
  Fragment,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import StatusBadge from "@/components/StatusBadge";
import { useHarStore } from "@/hooks/useHarStore";
import {
  searchEntries,
  parseScopeParam,
  serializeScopeParam,
  kvEntryId,
  KV_LOCATIONS,
  type KvLocation,
  type KvSearchMode,
  type KvSearchQuery,
  type KvSearchHit,
  type MatchRange,
} from "@/utils/kvSearch";
import type { EntryRecord, HarAnalysis } from "@/types/har";

// ---------------------------------------------------------------------------
// File color palette (kept in sync with /performance, /performance/diff, /cors)
// ---------------------------------------------------------------------------

const FILE_COLORS = [
  { dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { dot: "bg-purple-500", text: "text-purple-600 dark:text-purple-400" },
  { dot: "bg-pink-500", text: "text-pink-600 dark:text-pink-400" },
  { dot: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
  { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  { dot: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" },
] as const;

const fileColor = (i: number) => FILE_COLORS[i % FILE_COLORS.length];

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

type FileScope = "all" | number;

interface PageQuery {
  name: string;
  value: string;
  url: string;
  scope: Set<KvLocation>;
  mode: KvSearchMode;
  caseSensitive: boolean;
  file: FileScope;
  expand: string;
}

function parseMode(raw: string | null): KvSearchMode {
  return raw === "exact" || raw === "regex" ? raw : "contains";
}

function parseQuery(sp: URLSearchParams, fileCount: number): PageQuery {
  const fileParam = sp.get("file") ?? "all";
  let file: FileScope = "all";
  if (fileParam !== "all") {
    const n = Number(fileParam);
    if (Number.isInteger(n) && n >= 0 && n < fileCount) file = n;
  }
  return {
    name: sp.get("name") ?? "",
    value: sp.get("value") ?? "",
    url: sp.get("url") ?? "",
    scope: parseScopeParam(sp.get("scope")),
    mode: parseMode(sp.get("mode")),
    caseSensitive: sp.get("cs") === "1",
    file,
    expand: sp.get("expand") ?? "",
  };
}

function buildQueryString(patch: Partial<PageQuery>, base: URLSearchParams) {
  const next = new URLSearchParams(base.toString());
  if (patch.name !== undefined) {
    if (patch.name === "") next.delete("name");
    else next.set("name", patch.name);
  }
  if (patch.value !== undefined) {
    if (patch.value === "") next.delete("value");
    else next.set("value", patch.value);
  }
  if (patch.url !== undefined) {
    if (patch.url === "") next.delete("url");
    else next.set("url", patch.url);
  }
  if (patch.scope !== undefined) {
    const serialized = serializeScopeParam(patch.scope);
    if (serialized === "rh,sh,rc,sc") next.delete("scope");
    else next.set("scope", serialized);
  }
  if (patch.mode !== undefined) {
    if (patch.mode === "contains") next.delete("mode");
    else next.set("mode", patch.mode);
  }
  if (patch.caseSensitive !== undefined) {
    if (!patch.caseSensitive) next.delete("cs");
    else next.set("cs", "1");
  }
  if (patch.file !== undefined) {
    if (patch.file === "all") next.delete("file");
    else next.set("file", String(patch.file));
  }
  if (patch.expand !== undefined) {
    if (patch.expand === "") next.delete("expand");
    else next.set("expand", patch.expand);
  }
  return next.toString();
}

// ---------------------------------------------------------------------------
// Location styling
// ---------------------------------------------------------------------------

const LOCATION_STYLE: Record<
  KvLocation,
  { label: string; chip: string; dot: string }
> = {
  "request-header": {
    label: "Req Header",
    chip: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
    dot: "bg-blue-500",
  },
  "response-header": {
    label: "Res Header",
    chip: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50",
    dot: "bg-indigo-500",
  },
  "request-cookie": {
    label: "Req Cookie",
    chip: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    dot: "bg-amber-500",
  },
  "response-cookie": {
    label: "Res Cookie",
    chip: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900/50",
    dot: "bg-pink-500",
  },
};

// ---------------------------------------------------------------------------
// Page entry
// ---------------------------------------------------------------------------

export default function KvSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
          Loading...
        </div>
      }
    >
      <KvSearchPageContent />
    </Suspense>
  );
}

function KvSearchPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<PageQuery>) => {
    const qs = buildQueryString(patch, new URLSearchParams(sp.toString()));
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Local input state (debounced into the URL) keeps typing snappy.
  const [nameInput, setNameInput] = useState(q.name);
  const [valueInput, setValueInput] = useState(q.value);
  const [urlInput, setUrlInput] = useState(q.url);

  // Sync local inputs when the URL changes from outside (e.g. deep link).
  const lastUrlName = useRef(q.name);
  const lastUrlValue = useRef(q.value);
  const lastUrlUrl = useRef(q.url);
  useEffect(() => {
    if (q.name !== lastUrlName.current) {
      setNameInput(q.name);
      lastUrlName.current = q.name;
    }
    if (q.value !== lastUrlValue.current) {
      setValueInput(q.value);
      lastUrlValue.current = q.value;
    }
    if (q.url !== lastUrlUrl.current) {
      setUrlInput(q.url);
      lastUrlUrl.current = q.url;
    }
  }, [q.name, q.value, q.url]);

  // Debounce input → URL (150 ms idle).
  useEffect(() => {
    if (nameInput === q.name && valueInput === q.value && urlInput === q.url) {
      return;
    }
    const t = setTimeout(() => {
      const patch: Partial<PageQuery> = {};
      if (nameInput !== q.name) patch.name = nameInput;
      if (valueInput !== q.value) patch.value = valueInput;
      if (urlInput !== q.url) patch.url = urlInput;
      if (Object.keys(patch).length > 0) {
        lastUrlName.current = nameInput;
        lastUrlValue.current = valueInput;
        lastUrlUrl.current = urlInput;
        setQuery(patch);
      }
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameInput, valueInput, urlInput]);

  const entries = useMemo<EntryRecord[]>(() => {
    if (q.file === "all") return analyses.flatMap((a) => a.entries);
    return analyses[q.file]?.entries ?? [];
  }, [analyses, q.file]);

  const outcome = useMemo(() => {
    const query: KvSearchQuery = {
      name: q.name,
      value: q.value,
      url: q.url,
      scope: q.scope,
      mode: q.mode,
      caseSensitive: q.caseSensitive,
    };
    return searchEntries(entries, query);
  }, [entries, q.name, q.value, q.url, q.scope, q.mode, q.caseSensitive]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-500">
        Loading...
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-600 dark:text-slate-400 text-lg">
            No HAR files loaded.
          </p>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to upload
          </Link>
        </div>
      </div>
    );
  }

  const hasInput = q.name !== "" || q.value !== "";

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <PageHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <PageTitle fileCount={analyses.length} scope={q.file} />
        <SearchBar
          analyses={analyses}
          query={q}
          setQuery={setQuery}
          nameInput={nameInput}
          valueInput={valueInput}
          urlInput={urlInput}
          onNameChange={setNameInput}
          onValueChange={setValueInput}
          onUrlChange={setUrlInput}
          errors={outcome.errors}
        />
        <SummaryLine
          outcome={outcome}
          analyses={analyses}
          hasInput={hasInput}
          query={q}
        />
        <ResultsTable
          hits={outcome.hits}
          analyses={analyses}
          query={q}
          setQuery={setQuery}
          hasInput={hasInput}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
        <Link
          href="/"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </Link>
        <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-4.35-4.35M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13z"
            />
          </svg>
          <h1 className="text-xl font-bold tracking-tight">
            Header &amp; Cookie Search
          </h1>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function PageTitle({
  fileCount,
  scope,
}: {
  fileCount: number;
  scope: FileScope;
}) {
  const inScope = scope === "all" ? "all loaded files" : "1 file";
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Header &amp; Cookie Search
      </h2>
      <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
        Search by name and/or value across request and response headers and
        cookies in {inScope} ({fileCount.toLocaleString()} HAR file
        {fileCount !== 1 ? "s" : ""} loaded).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

function ScopeChip({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
        active
          ? "bg-blue-600 text-white border-blue-600 dark:border-blue-500"
          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function SearchBar({
  analyses,
  query,
  setQuery,
  nameInput,
  valueInput,
  urlInput,
  onNameChange,
  onValueChange,
  onUrlChange,
  errors,
}: {
  analyses: HarAnalysis[];
  query: PageQuery;
  setQuery: (patch: Partial<PageQuery>) => void;
  nameInput: string;
  valueInput: string;
  urlInput: string;
  onNameChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  errors: { side: "name" | "value"; message: string }[];
}) {
  const nameError = errors.find((e) => e.side === "name");
  const valueError = errors.find((e) => e.side === "value");

  const toggleScope = (loc: KvLocation) => {
    const next = new Set(query.scope);
    if (next.has(loc)) next.delete(loc);
    else next.add(loc);
    setQuery({ scope: next });
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
      {/* Name + Value inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="kv-name"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1.5"
          >
            Name
          </label>
          <input
            id="kv-name"
            type="text"
            value={nameInput}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Authorization, sessionid, ^x-"
            className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 ${
              nameError
                ? "border-red-500 dark:border-red-500"
                : "border-slate-200 dark:border-slate-700"
            }`}
          />
          {nameError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Invalid regex: {nameError.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="kv-value"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1.5"
          >
            Value
          </label>
          <input
            id="kv-value"
            type="text"
            value={valueInput}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="e.g. Bearer, application/json"
            className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 ${
              valueError
                ? "border-red-500 dark:border-red-500"
                : "border-slate-200 dark:border-slate-700"
            }`}
          />
          {valueError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Invalid regex: {valueError.message}
            </p>
          )}
        </div>
      </div>

      {/* URL filter (entry pre-filter — always contains, case-insensitive) */}
      <div>
        <label
          htmlFor="kv-url"
          className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1.5"
        >
          URL contains{" "}
          <span className="normal-case text-slate-500 dark:text-slate-600">
            (optional, narrows entries before name/value)
          </span>
        </label>
        <input
          id="kv-url"
          type="text"
          value={urlInput}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="e.g. /api/v1/users, cdn.example.com"
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Scope chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mr-1">
          Scope:
        </span>
        {KV_LOCATIONS.map((loc) => {
          const style = LOCATION_STYLE[loc];
          const active = query.scope.has(loc);
          return (
            <ScopeChip
              key={loc}
              active={active}
              onClick={() => toggleScope(loc)}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/80" : style.dot}`}
              />
              {style.label}
            </ScopeChip>
          );
        })}
      </div>

      {/* Mode + case + file row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <label
            htmlFor="kv-mode"
            className="uppercase tracking-wider text-slate-600 dark:text-slate-500"
          >
            Mode:
          </label>
          <select
            id="kv-mode"
            value={query.mode}
            onChange={(e) => setQuery({ mode: e.target.value as KvSearchMode })}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="contains">Contains</option>
            <option value="exact">Exact</option>
            <option value="regex">Regex</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={query.caseSensitive}
            onChange={(e) => setQuery({ caseSensitive: e.target.checked })}
            className="accent-blue-600"
          />
          Case sensitive
        </label>
        {analyses.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="kv-file"
              className="uppercase tracking-wider text-slate-600 dark:text-slate-500"
            >
              File:
            </label>
            <select
              id="kv-file"
              value={query.file === "all" ? "all" : String(query.file)}
              onChange={(e) => {
                const v = e.target.value;
                setQuery({ file: v === "all" ? "all" : Number(v) });
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 max-w-[240px]"
            >
              <option value="all">All files ({analyses.length})</option>
              {analyses.map((a, i) => (
                <option key={i} value={i}>
                  {a.fileName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary line
// ---------------------------------------------------------------------------

function SummaryLine({
  outcome,
  analyses,
  hasInput,
  query,
}: {
  outcome: ReturnType<typeof searchEntries>;
  analyses: HarAnalysis[];
  hasInput: boolean;
  query: PageQuery;
}) {
  if (!hasInput) return null;
  if (outcome.errors.length > 0) return null;

  const { totalHits, totalMatches, filesTouched, perLocation } =
    outcome.summary;
  const scopeLabel =
    query.file === "all"
      ? `across ${filesTouched} of ${analyses.length} file${analyses.length === 1 ? "" : "s"}`
      : `in ${analyses[query.file]?.fileName ?? "1 file"}`;
  const urlLabel =
    query.url !== "" ? (
      <>
        {" "}
        · URL contains{" "}
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
          {query.url}
        </span>
      </>
    ) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
      <span>
        <span className="font-semibold">{totalHits.toLocaleString()}</span> entr
        {totalHits === 1 ? "y" : "ies"} matched ·{" "}
        <span className="font-semibold">{totalMatches.toLocaleString()}</span>{" "}
        kv match{totalMatches === 1 ? "" : "es"} {scopeLabel}
        {urlLabel}
      </span>
      {totalMatches > 0 && (
        <span className="text-xs text-slate-600 dark:text-slate-500 flex items-center gap-2">
          {KV_LOCATIONS.filter((loc) => perLocation[loc] > 0).map((loc) => {
            const s = LOCATION_STYLE[loc];
            return (
              <span key={loc} className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {perLocation[loc]} {s.label.toLowerCase()}
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function ResultsTable({
  hits,
  analyses,
  query,
  setQuery,
  hasInput,
}: {
  hits: KvSearchHit[];
  analyses: HarAnalysis[];
  query: PageQuery;
  setQuery: (patch: Partial<PageQuery>) => void;
  hasInput: boolean;
}) {
  const expandedRef = useRef<HTMLTableRowElement | null>(null);
  // Index each entry within its file for stable entryId (matches kvEntryId).
  const indexedAnalyses = useMemoIndexed(analyses);

  // Scroll the expanded row into view on deep-link load.
  useEffect(() => {
    if (query.expand && expandedRef.current) {
      expandedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasInput) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        Enter a name or value to search across request and response headers and
        cookies.
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
        <p>No matches.</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
          Try a different name/value, clear the URL filter, broaden the scope
          chips, or switch the match mode.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-900/60">
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-6">
              <span className="sr-only">Expand</span>
            </th>
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              File
            </th>
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Method
            </th>
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Status
            </th>
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              URL
            </th>
            <th className="py-2.5 px-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Matches
            </th>
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Timestamp (UTC)
            </th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => {
            const indexInFile = indexedAnalyses.get(hit.entry) ?? 0;
            const id = kvEntryId(hit.entry, indexInFile);
            const expanded = query.expand === id;
            return (
              <ResultRow
                key={id}
                hit={hit}
                expanded={expanded}
                analyses={analyses}
                onToggle={() => setQuery({ expand: expanded ? "" : id })}
                rowRef={expanded ? expandedRef : undefined}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Build a stable entry → indexInFile map so kvEntryId is consistent. */
function useMemoIndexed(analyses: HarAnalysis[]) {
  return useMemo(() => {
    const map = new Map<EntryRecord, number>();
    for (const a of analyses) {
      a.entries.forEach((e, i) => map.set(e, i));
    }
    return map;
  }, [analyses]);
}

// ---------------------------------------------------------------------------
// Result row + expanded panel
// ---------------------------------------------------------------------------

function ResultRow({
  hit,
  expanded,
  analyses,
  onToggle,
  rowRef,
}: {
  hit: KvSearchHit;
  expanded: boolean;
  analyses: HarAnalysis[];
  onToggle: () => void;
  rowRef?: React.RefObject<HTMLTableRowElement | null>;
}) {
  const entry = hit.entry;
  const fileMeta = analyses[entry.harFileIndex];
  const color = fileColor(entry.harFileIndex);
  let pathName = entry.url;
  try {
    pathName = new URL(entry.url).pathname || "/";
  } catch {
    // Leave raw URL fallback.
  }

  return (
    <Fragment>
      <tr
        ref={rowRef}
        className={`border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
          expanded ? "bg-slate-50 dark:bg-slate-800/40" : ""
        }`}
        onClick={onToggle}
      >
        <td className="py-2 px-3 align-top">
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </td>
        <td className="py-2 px-3 align-top">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
            <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
            <span className="truncate max-w-[180px]" title={fileMeta?.fileName}>
              {fileMeta?.fileName ?? "?"}
            </span>
          </span>
        </td>
        <td className="py-2 px-3 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
          {entry.method}
        </td>
        <td className="py-2 px-3 align-top">
          <StatusBadge code={entry.status} />
        </td>
        <td
          className="py-2 px-3 align-top font-mono text-xs truncate max-w-[420px]"
          title={entry.url}
        >
          <Link
            href={`/compare?url=${encodeURIComponent(entry.url)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {pathName}
          </Link>
        </td>
        <td className="py-2 px-3 align-top text-right text-xs text-slate-700 dark:text-slate-300 tabular-nums">
          {hit.matches.length}
        </td>
        <td className="py-2 px-3 align-top text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {entry.startedDateTime
            ? new Date(entry.startedDateTime).toLocaleString("en-US", {
                timeZone: "UTC",
              }) + " UTC"
            : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
          <td colSpan={7} className="px-3 py-3">
            <ExpandedPanel hit={hit} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function ExpandedPanel({ hit }: { hit: KvSearchHit }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600 dark:text-slate-500 break-all">
        <span className="uppercase tracking-wider mr-2">URL</span>
        <Link
          href={`/header-diff?url=${encodeURIComponent(hit.entry.url)}`}
          className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
        >
          {hit.entry.url}
        </Link>
      </div>
      <ul className="space-y-1.5">
        {hit.matches.map((m, i) => {
          const style = LOCATION_STYLE[m.location];
          return (
            <li
              key={i}
              className="flex flex-wrap items-start gap-2 text-xs bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1.5"
            >
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${style.chip} font-medium`}
              >
                <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                {style.label}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                <Highlight text={m.name} ranges={m.nameRanges} />
              </span>
              <span className="text-slate-400 dark:text-slate-600">:</span>
              <span className="font-mono text-slate-600 dark:text-slate-400 break-all flex-1 min-w-0">
                <Highlight text={m.value} ranges={m.valueRanges} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Highlight({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  // Ranges are non-overlapping and sorted by `searchEntries`.
  const out: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <mark
        key={i}
        className="bg-yellow-200 dark:bg-yellow-500/40 text-slate-900 dark:text-yellow-50 rounded px-0.5"
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
