"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import type { DiffQuery } from "@/components/performance-diff/types";
import {
  PageTitle,
  SameFileHint,
  PickerBar,
  KpiDeltaTable,
  TimingPhaseDelta,
  HistogramDelta,
  ContentTypeDeltaSection,
  BiggestMoversSection,
  RegressionsSection,
  OnlyInSection,
} from "@/components/performance-diff/DiffPanels";
import type { HistogramScale, UrlMatchKey } from "@/utils/perfStats";

function parseQuery(sp: URLSearchParams, fileCount: number): DiffQuery {
  const baseRaw = parseInt(sp.get("base") ?? "0", 10);
  const cmpRaw = parseInt(sp.get("cmp") ?? "1", 10);
  const base =
    Number.isFinite(baseRaw) && baseRaw >= 0 && baseRaw < fileCount
      ? baseRaw
      : 0;
  const cmpFallback = fileCount > 1 ? Math.min(1, fileCount - 1) : 0;
  const cmp =
    Number.isFinite(cmpRaw) && cmpRaw >= 0 && cmpRaw < fileCount
      ? cmpRaw
      : cmpFallback;
  const match: UrlMatchKey = sp.get("match") === "full" ? "full" : "path";
  const scale: HistogramScale = sp.get("scale") === "linear" ? "linear" : "log";
  return { base, cmp, match, scale };
}

export default function PerformanceDiffPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <PerformanceDiffPageContent />
    </Suspense>
  );
}

function PerformanceDiffPageContent() {
  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<DiffQuery>) => {
    const next = new URLSearchParams(sp.toString());
    const merged = { ...q, ...patch };
    next.set("base", String(merged.base));
    next.set("cmp", String(merged.cmp));
    next.set("match", merged.match);
    next.set("scale", merged.scale);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (analyses.length === 0) {
    return (
      <PageShell
        back={{ href: "/performance", label: "Overview" }}
        crumb="Pair Diff"
      >
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  if (analyses.length < 2) {
    return (
      <PageShell
        back={{ href: "/performance", label: "Overview" }}
        crumb="Pair Diff"
      >
        <EmptyState
          title="Pair-mode comparison needs at least 2 HAR files."
          description={`You have ${analyses.length} loaded.`}
          action={
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link
                href="/"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← Add another file
              </Link>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <Link
                href="/performance"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Performance overview →
              </Link>
            </div>
          }
        />
      </PageShell>
    );
  }

  const sameFile = q.base === q.cmp;

  return (
    <PageShell
      back={{ href: "/performance", label: "Overview" }}
      crumb="Pair Diff"
      mainClassName="space-y-10"
    >
      <PageTitle
        base={analyses[q.base]}
        cmp={analyses[q.cmp]}
        match={q.match}
      />
      <PickerBar query={q} setQuery={setQuery} analyses={analyses} />
      {sameFile ? (
        <SameFileHint />
      ) : (
        <>
          <KpiDeltaTable base={analyses[q.base]} cmp={analyses[q.cmp]} />
          <TimingPhaseDelta base={analyses[q.base]} cmp={analyses[q.cmp]} />
          <HistogramDelta
            base={analyses[q.base]}
            cmp={analyses[q.cmp]}
            query={q}
            setQuery={setQuery}
          />
          <ContentTypeDeltaSection
            base={analyses[q.base]}
            cmp={analyses[q.cmp]}
          />
          <BiggestMoversSection
            base={analyses[q.base]}
            cmp={analyses[q.cmp]}
            match={q.match}
          />
          <RegressionsSection
            base={analyses[q.base]}
            cmp={analyses[q.cmp]}
            match={q.match}
          />
          <OnlyInSection
            base={analyses[q.base]}
            cmp={analyses[q.cmp]}
            baseIndex={q.base}
            cmpIndex={q.cmp}
            match={q.match}
          />
        </>
      )}
    </PageShell>
  );
}
