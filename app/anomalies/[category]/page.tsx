"use client";

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { useHarStore } from "@/hooks/useHarStore";
import {
  analyzeStore,
  scopedCategorySlice,
  isAnomalyCategory,
  type AnomalyCategory,
  type AnomalyCategoryQuery,
  type FileScope,
} from "@/utils/anomalies";
import { parseExpandParam } from "@/utils/queryParams";
import {
  CategoryTitle,
  CategoryFilterBar,
  CategoryGroupTable,
} from "@/components/anomalies/CategoryPanels";
import { RelatedTools } from "@/components/anomalies/HubPanels";

function parseQuery(sp: URLSearchParams, fileCount: number): AnomalyCategoryQuery {
  const fileParam = sp.get("file") ?? "all";
  let file: FileScope = "all";
  if (fileParam !== "all") {
    const n = Number(fileParam);
    if (Number.isInteger(n) && n >= 0 && n < fileCount) file = n;
  }
  return {
    file,
    expand: parseExpandParam(sp.get("expand")),
  };
}

function buildQueryString(
  patch: Partial<AnomalyCategoryQuery>,
  base: URLSearchParams,
) {
  const next = new URLSearchParams(base.toString());
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

export default function AnomalyCategoryPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <AnomalyCategoryContent />
    </Suspense>
  );
}

function AnomalyCategoryContent() {
  const params = useParams();
  const categoryParam = params.category;
  const category =
    typeof categoryParam === "string" && isAnomalyCategory(categoryParam)
      ? categoryParam
      : null;

  const { analyses, isLoading } = useHarStore();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = parseQuery(new URLSearchParams(sp.toString()), analyses.length);

  const setQuery = (patch: Partial<AnomalyCategoryQuery>) => {
    const qs = buildQueryString(patch, new URLSearchParams(sp.toString()));
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const report = useMemo(
    () => (analyses.length > 0 ? analyzeStore(analyses) : null),
    [analyses],
  );

  if (!category) {
    return (
      <PageShell back={{ href: "/anomalies", label: "Anomalies" }} crumb="Unknown">
        <EmptyState title="Unknown anomaly category." />
      </PageShell>
    );
  }

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (!report || analyses.length === 0) {
    return (
      <PageShell back={{ href: "/anomalies", label: "Anomalies" }} crumb="Anomalies">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  const slice = scopedCategorySlice(report, category, q.file);

  return (
    <PageShell
      back={{ href: "/anomalies", label: "Anomalies" }}
      crumb="Anomalies"
    >
      <div className="space-y-6">
        <CategoryTitle
          category={category}
          fileCount={analyses.length}
          slice={slice}
          scope={q.file}
        />
        <CategoryFilterBar
          analyses={analyses}
          report={report}
          category={category}
          query={q}
          setQuery={setQuery}
        />
        <CategoryGroupTable
          category={category}
          groups={slice.groups}
          query={q}
          setQuery={setQuery}
          analyses={analyses}
        />
        <RelatedTools />
      </div>
    </PageShell>
  );
}
