"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import {
  searchEntries,
  parseScopeParam,
  serializeScopeParam,
  type KvSearchMode,
  type KvSearchQuery,
} from "@/utils/kvSearch";
import type { EntryRecord } from "@/types/har";
import type { FileScope, PageQuery } from "@/components/kv-search/types";
import {
  PageTitle,
  SearchBar,
  SummaryLine,
  ResultsTable,
} from "@/components/kv-search/KvSearchPanels";
import { parseExpandParam } from "@/utils/queryParams";

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
    expand: parseExpandParam(sp.get("expand")),
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
    const s = serializeScopeParam(patch.scope);
    if (s === "") next.delete("scope");
    else next.set("scope", s);
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

export default function KvSearchPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
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

  const [nameInput, setNameInput] = useState(q.name);
  const [valueInput, setValueInput] = useState(q.value);
  const [urlInput, setUrlInput] = useState(q.url);

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
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (analyses.length === 0) {
    return (
      <PageShell back={{ href: "/", label: "Home" }} crumb="KV Search">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  const hasInput = q.name !== "" || q.value !== "";

  return (
    <PageShell
      back={{ href: "/", label: "Home" }}
      crumb="KV Search"
      mainClassName="space-y-6"
    >
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
    </PageShell>
  );
}
