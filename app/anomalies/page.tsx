"use client";

import { Suspense, useMemo } from "react";
import { useHarStore } from "@/hooks/useHarStore";
import { PageShell } from "@/components/shell/PageShell";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadingState } from "@/components/shell/LoadingState";
import { analyzeStore } from "@/utils/anomalies";
import {
  HubTitle,
  HubCards,
  CorrelationStrip,
  RelatedTools,
} from "@/components/anomalies/HubPanels";

export default function AnomaliesHubPage() {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading…" />}>
      <AnomaliesHubContent />
    </Suspense>
  );
}

function AnomaliesHubContent() {
  const { analyses, isLoading } = useHarStore();

  const report = useMemo(
    () => (analyses.length > 0 ? analyzeStore(analyses) : null),
    [analyses],
  );

  if (isLoading) {
    return <LoadingState fullScreen message="Loading…" />;
  }

  if (!report || analyses.length === 0) {
    return (
      <PageShell back={{ href: "/", label: "Home" }} crumb="Anomalies">
        <EmptyState title="No HAR files loaded." />
      </PageShell>
    );
  }

  return (
    <PageShell back={{ href: "/", label: "Home" }} crumb="Anomalies">
      <div className="space-y-6">
        <HubTitle fileCount={analyses.length} report={report} />
        <HubCards report={report} />
        <CorrelationStrip report={report} />
        <RelatedTools />
      </div>
    </PageShell>
  );
}
