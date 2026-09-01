"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import {
  analyzeStore,
  scopedNoValidatorGroups,
  scopedPathGroups,
} from "@/utils/cacheValidator";
import {
  PageTitle,
  FilterBar,
  KpiSummary,
  PathGroupTable,
} from "@/components/cache-validator/ValidatorPanels";
import { parseExpandParam } from "@/utils/queryParams";
import type { CacheValidatorQuery, FileScope } from "@/components/cache-validator/types";

function parseQuery(sp: URLSearchParams, fileCount: number): CacheValidatorQuery {
  const fileParam = sp.get("file") ?? "all";
  let file: FileScope = "all";
  if (fileParam !== "all") {
    const n = Number(fileParam);
    if (Number.isInteger(n) && n >= 0 && n < fileCount) file = n;
  }
  return {
    file,
    showNoValidator: sp.get("no-validator") === "1",
    expand: parseExpandParam(sp.get("expand")),
  };
}

function buildQueryString(
  patch: Partial<CacheValidatorQuery>,
  base: URLSearchParams,
) {
  const next = new URLSearchParams(base.toString());
  if (patch.file !== undefined) {
    if (patch.file === "all") next.delete("file");
    else next.set("file", String(patch.file));
  }
  if (patch.showNoValidator !== undefined) {
    if (patch.showNoValidator) next.set("no-validator", "1");
    else next.delete("no-validator");
  }
  if (patch.expand !== undefined) {
    if (patch.expand === "") next.delete("expand");
    else next.set("expand", patch.expand);
  }
  return next.toString();
}

export default function CacheValidatorPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <CacheValidatorPageContent />
    </Suspense>
  );
}

function CacheValidatorPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<CacheValidatorQuery>) => {
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
      <PageShell back={{ href: "/", label: "Home" }} crumb="Cache validator">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  const driftGroups = scopedPathGroups(report, q.file);
  const noValidatorGroups = scopedNoValidatorGroups(report, q.file);
  const noValidatorPathCount =
    q.file === "all"
      ? report.noValidatorPathCount
      : (report.files[q.file]?.noValidatorPathCount ?? 0);

  const visibleGroupCount =
    driftGroups.length + (q.showNoValidator ? noValidatorGroups.length : 0);

  return (
    <PageShell back={{ href: "/", label: "Home" }} crumb="Cache validator">
      <PageTitle
        fileCount={analyses.length}
        report={report}
        visibleGroupCount={visibleGroupCount}
        scope={q.file}
        showNoValidator={q.showNoValidator}
      />
      <FilterBar
        analyses={analyses}
        report={report}
        query={q}
        setQuery={setQuery}
      />
      <KpiSummary
        groups={driftGroups}
        noValidatorPathCount={noValidatorPathCount}
      />
      <PathGroupTable
        driftGroups={driftGroups}
        noValidatorGroups={noValidatorGroups}
        analyses={analyses}
        query={q}
        setQuery={setQuery}
        noValidatorPathCount={noValidatorPathCount}
      />
    </PageShell>
  );
}
