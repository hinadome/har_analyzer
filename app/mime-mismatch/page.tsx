"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import { analyzeStore, visibleMismatchEntries } from "@/utils/mimeMismatch";
import {
  PageTitle,
  FilterBar,
  KpiSummary,
  MismatchTable,
} from "@/components/mime-mismatch/MismatchPanels";
import { parseExpandParam } from "@/utils/queryParams";
import type { FileScope, MimeMismatchQuery } from "@/components/mime-mismatch/types";

function parseQuery(sp: URLSearchParams, fileCount: number): MimeMismatchQuery {
  const fileParam = sp.get("file") ?? "all";
  let file: FileScope = "all";
  if (fileParam !== "all") {
    const n = Number(fileParam);
    if (Number.isInteger(n) && n >= 0 && n < fileCount) file = n;
  }
  return {
    file,
    showUnverified: sp.get("unverified") === "1",
    expand: parseExpandParam(sp.get("expand")),
  };
}

function buildQueryString(patch: Partial<MimeMismatchQuery>, base: URLSearchParams) {
  const next = new URLSearchParams(base.toString());
  if (patch.file !== undefined) {
    if (patch.file === "all") next.delete("file");
    else next.set("file", String(patch.file));
  }
  if (patch.showUnverified !== undefined) {
    if (patch.showUnverified) next.set("unverified", "1");
    else next.delete("unverified");
  }
  if (patch.expand !== undefined) {
    if (patch.expand === "") next.delete("expand");
    else next.set("expand", patch.expand);
  }
  return next.toString();
}

export default function MimeMismatchPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <MimeMismatchPageContent />
    </Suspense>
  );
}

function MimeMismatchPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<MimeMismatchQuery>) => {
    const qs = buildQueryString(patch, new URLSearchParams(sp.toString()));
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const report = useMemo(
    () => (analyses.length > 0 ? analyzeStore(analyses) : null),
    [analyses],
  );

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (analyses.length === 0 || !report) {
    return (
      <PageShell back={{ href: "/", label: "Home" }} crumb="MIME mismatch">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  const scopedFiles =
    q.file === "all" ? report.files : [report.files[q.file]].filter(Boolean);

  const visibleCount = visibleMismatchEntries(report, q.showUnverified).filter(
    (e) => q.file === "all" || e.fileIndex === q.file,
  ).length;

  return (
    <PageShell back={{ href: "/", label: "Home" }} crumb="MIME mismatch">
      <PageTitle
        fileCount={analyses.length}
        report={report}
        visibleCount={visibleCount}
        scope={q.file}
        showUnverified={q.showUnverified}
      />
      <FilterBar
        analyses={analyses}
        report={report}
        query={q}
        setQuery={setQuery}
      />
      <KpiSummary files={scopedFiles} />
      <MismatchTable
        files={scopedFiles}
        analyses={analyses}
        query={q}
        setQuery={setQuery}
      />
    </PageShell>
  );
}
