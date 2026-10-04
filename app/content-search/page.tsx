"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import { loadEntryBodyAsync } from "@/utils/storage";
import {
  searchContent,
  type ContentSearchMode,
  type ContentSearchQuery,
  type EntryBody,
} from "@/utils/contentSearch";
import type { EntryRecord } from "@/types/har";
import type { FileScope, PageQuery } from "@/components/content-search/types";
import {
  PageTitle,
  SearchBar,
  SummaryLine,
  ResultsTable,
} from "@/components/content-search/ContentSearchPanels";
import { parseExpandParam } from "@/utils/queryParams";

function parseMode(raw: string | null): ContentSearchMode {
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
    text: sp.get("text") ?? "",
    url: sp.get("url") ?? "",
    mode: parseMode(sp.get("mode")),
    caseSensitive: sp.get("cs") === "1",
    file,
    expand: parseExpandParam(sp.get("expand")),
  };
}

function buildQueryString(patch: Partial<PageQuery>, base: URLSearchParams) {
  const next = new URLSearchParams(base.toString());
  if (patch.text !== undefined) {
    if (patch.text === "") next.delete("text");
    else next.set("text", patch.text);
  }
  if (patch.url !== undefined) {
    if (patch.url === "") next.delete("url");
    else next.set("url", patch.url);
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

export default function ContentSearchPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <ContentSearchPageContent />
    </Suspense>
  );
}

function ContentSearchPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<PageQuery>) => {
    const qs = buildQueryString(patch, new URLSearchParams(sp.toString()));
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [textInput, setTextInput] = useState(q.text);
  const [urlInput, setUrlInput] = useState(q.url);

  const lastUrlText = useRef(q.text);
  const lastUrlUrl = useRef(q.url);
  useEffect(() => {
    if (q.text !== lastUrlText.current) {
      setTextInput(q.text);
      lastUrlText.current = q.text;
    }
    if (q.url !== lastUrlUrl.current) {
      setUrlInput(q.url);
      lastUrlUrl.current = q.url;
    }
  }, [q.text, q.url]);

  useEffect(() => {
    if (textInput === q.text && urlInput === q.url) return;
    const t = setTimeout(() => {
      const patch: Partial<PageQuery> = {};
      if (textInput !== q.text) patch.text = textInput;
      if (urlInput !== q.url) patch.url = urlInput;
      if (Object.keys(patch).length > 0) {
        lastUrlText.current = textInput;
        lastUrlUrl.current = urlInput;
        setQuery(patch);
      }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput, urlInput]);

  // Entries in file scope.
  const entries = useMemo<EntryRecord[]>(() => {
    if (q.file === "all") return analyses.flatMap((a) => a.entries);
    return analyses[q.file]?.entries ?? [];
  }, [analyses, q.file]);

  // Entries that pass the URL pre-filter and have a captured body — the only
  // ones whose bodies we need to load from IndexedDB.
  const urlNeedle = q.url.toLowerCase();
  const candidates = useMemo<EntryRecord[]>(() => {
    return entries.filter((e) => {
      if (urlNeedle !== "" && !e.url.toLowerCase().includes(urlNeedle)) {
        return false;
      }
      return (
        e.hasResponseBody === true &&
        (e.bodyId !== undefined || e.responseContent !== undefined)
      );
    });
  }, [entries, urlNeedle]);

  // On-demand body cache keyed by bodyId (persists across searches).
  const bodyCache = useRef<Map<string, string | undefined>>(new Map());
  const [, forceTick] = useState(0);
  const [loadingBodies, setLoadingBodies] = useState(false);

  const hasInput = q.text !== "";

  // Load bodies for candidates once a search is active. Only fetch keys that
  // aren't already cached.
  useEffect(() => {
    if (!hasInput) return;
    const toLoad = candidates.filter((e) => {
      if (e.responseContent !== undefined) return false;
      return e.bodyId !== undefined && !bodyCache.current.has(e.bodyId);
    });
    if (toLoad.length === 0) return;

    let cancelled = false;
    setLoadingBodies(true);
    (async () => {
      for (const e of toLoad) {
        if (cancelled) return;
        const text = await loadEntryBodyAsync(e.bodyId);
        if (cancelled) return;
        bodyCache.current.set(e.bodyId as string, text);
      }
      if (!cancelled) {
        setLoadingBodies(false);
        forceTick((n) => n + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasInput, candidates]);

  // Pair each candidate with its resolved body.
  const records = useMemo<EntryBody[]>(() => {
    return candidates.map((entry) => {
      const body =
        entry.responseContent !== undefined
          ? entry.responseContent
          : entry.bodyId !== undefined
            ? bodyCache.current.get(entry.bodyId)
            : undefined;
      return { entry, body };
    });
    // forceTick (via loadingBodies) drives recompute after loads land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, loadingBodies]);

  const outcome = useMemo(() => {
    const query: ContentSearchQuery = {
      text: q.text,
      url: q.url,
      mode: q.mode,
      caseSensitive: q.caseSensitive,
    };
    return searchContent(records, query);
  }, [records, q.text, q.url, q.mode, q.caseSensitive]);

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (analyses.length === 0) {
    return (
      <PageShell back={{ href: "/", label: "Home" }} crumb="Content Search">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  const firstError = outcome.errors[0]?.message;

  return (
    <PageShell
      back={{ href: "/", label: "Home" }}
      crumb="Content Search"
      mainClassName="space-y-6"
    >
      <PageTitle fileCount={analyses.length} scope={q.file} />
      <SearchBar
        analyses={analyses}
        query={q}
        setQuery={setQuery}
        textInput={textInput}
        urlInput={urlInput}
        onTextChange={setTextInput}
        onUrlChange={setUrlInput}
        error={firstError}
        loadingBodies={loadingBodies}
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
    </PageShell>
  );
}
