"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import type { PerfQuery } from "@/components/performance/types";
import type { HistogramScale } from "@/utils/perfStats";
import {
  PageTitle,
  LegendBar,
  KpiMatrix,
  TimingPhaseComparison,
  Histogram,
  ContentTypePerf,
  CombinedTopN,
} from "@/components/performance/PerfPanels";

function parseQuery(sp: URLSearchParams): PerfQuery {
  const scale: HistogramScale = sp.get("scale") === "linear" ? "linear" : "log";
  return { scale };
}

export default function PerformancePage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <PerformancePageContent />
    </Suspense>
  );
}

function PerformancePageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()));

  const setQuery = (patch: Partial<PerfQuery>) => {
    const next = new URLSearchParams(sp.toString());
    const merged = { ...q, ...patch };
    next.set("scale", merged.scale);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (analyses.length === 0) {
    return (
      <PageShell back={{ href: "/", label: "Home" }} crumb="Performance">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  return (
    <PageShell
      back={{ href: "/", label: "Home" }}
      crumb="Performance"
      mainClassName="space-y-10"
    >
      <PageTitle fileCount={analyses.length} />
      <LegendBar analyses={analyses} />
      <KpiMatrix analyses={analyses} />
      <TimingPhaseComparison analyses={analyses} />
      <Histogram analyses={analyses} query={q} setQuery={setQuery} />
      <ContentTypePerf analyses={analyses} />
      <CombinedTopN analyses={analyses} />
    </PageShell>
  );
}
