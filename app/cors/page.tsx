"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import { analyzeStore, type CorsReport } from "@/utils/corsAnalysis";
import type { CorsQuery, FileScope, SeverityFilter } from "@/components/cors/types";
import {
  PageTitle,
  ScopeBar,
  KpiSummary,
  IssuesTable,
  CorsRequestsTable,
  PreflightPairsSection,
} from "@/components/cors/CorsPanels";

function parseQuery(sp: URLSearchParams, fileCount: number): CorsQuery {
  const fileParam = sp.get("file") ?? "all";
  let file: FileScope = "all";
  if (fileParam !== "all") {
    const n = Number(fileParam);
    if (Number.isInteger(n) && n >= 0 && n < fileCount) file = n;
  }
  const sev = sp.get("severity");
  const severity: SeverityFilter =
    sev === "error" || sev === "warning" || sev === "info" ? sev : "all";
  return {
    file,
    severity,
    origin: sp.get("origin") ?? "",
    expand: sp.get("expand") ?? "",
  };
}

function buildQueryString(q: Partial<CorsQuery>, base: URLSearchParams) {
  const next = new URLSearchParams(base.toString());
  if (q.file !== undefined) {
    if (q.file === "all") next.delete("file");
    else next.set("file", String(q.file));
  }
  if (q.severity !== undefined) {
    if (q.severity === "all") next.delete("severity");
    else next.set("severity", q.severity);
  }
  if (q.origin !== undefined) {
    if (q.origin === "") next.delete("origin");
    else next.set("origin", q.origin);
  }
  if (q.expand !== undefined) {
    if (q.expand === "") next.delete("expand");
    else next.set("expand", q.expand);
  }
  return next.toString();
}

export default function CorsPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <CorsPageContent />
    </Suspense>
  );
}

function CorsPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<CorsQuery>) => {
    const qs = buildQueryString(patch, new URLSearchParams(sp.toString()));
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const report: CorsReport | null = useMemo(
    () => (analyses.length > 0 ? analyzeStore(analyses) : null),
    [analyses],
  );

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (analyses.length === 0 || !report) {
    return (
      <PageShell back={{ href: "/", label: "Home" }} crumb="CORS">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  const scopedFiles =
    q.file === "all" ? report.files : [report.files[q.file]].filter(Boolean);

  const findingCount = scopedFiles.reduce(
    (n, f) => n + f.errorCount + f.warningCount + f.infoCount,
    0,
  );
  const requestsFirst = findingCount === 0;

  return (
    <PageShell back={{ href: "/", label: "Home" }} crumb="CORS">
      <PageTitle fileCount={analyses.length} report={report} scope={q.file} />
      <ScopeBar
        analyses={analyses}
        report={report}
        query={q}
        setQuery={setQuery}
      />
      <KpiSummary files={scopedFiles} />
      {requestsFirst ? (
        <>
          <CorsRequestsTable
            files={scopedFiles}
            analyses={analyses}
            query={q}
            setQuery={setQuery}
          />
          <IssuesTable
            files={scopedFiles}
            analyses={analyses}
            query={q}
            setQuery={setQuery}
          />
        </>
      ) : (
        <>
          <IssuesTable
            files={scopedFiles}
            analyses={analyses}
            query={q}
            setQuery={setQuery}
          />
          <CorsRequestsTable
            files={scopedFiles}
            analyses={analyses}
            query={q}
            setQuery={setQuery}
          />
        </>
      )}
      <PreflightPairsSection files={scopedFiles} analyses={analyses} />
    </PageShell>
  );
}
