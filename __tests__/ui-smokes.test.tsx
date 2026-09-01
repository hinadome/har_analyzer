/**
 * Landmark smokes for extracted route-family UI (titles / empty states).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/shell/EmptyState";
import { InsightStrip } from "@/components/home/InsightStrip";
import { PrivacyBanner } from "@/components/home/PrivacyBanner";
import { PageTitle as KvPageTitle, ResultsTable } from "@/components/kv-search/KvSearchPanels";
import { PageTitle as CorsPageTitle, CorsRequestsTable } from "@/components/cors/CorsPanels";
import { PageTitle as DiffPageTitle } from "@/components/performance-diff/DiffPanels";
import { TruncationNotice } from "@/components/content-diff/ContentDiffPanels";
import { ContentTypeSummary } from "@/components/shared/ContentTypeDisplay";
import { PageTitle as MimePageTitle } from "@/components/mime-mismatch/MismatchPanels";
import { PageTitle as CacheValidatorPageTitle } from "@/components/cache-validator/ValidatorPanels";
import { HubTitle } from "@/components/anomalies/HubPanels";
import { UrlPathPicker } from "@/components/shared/UrlPathPicker";
import type { HarAnalysis } from "@/types/har";
import type { CorsReport } from "@/utils/corsAnalysis";
import type { HomeInsights } from "@/utils/homeInsights";
import { KV_LOCATIONS } from "@/utils/kvSearch";

function stubAnalysis(name: string, index: number): HarAnalysis {
  return {
    fileName: name,
    fileIndex: index,
    totalRequests: 1,
    totalContentSize: 100,
    statusCodeCounts: { 200: 1 },
    methodCounts: { GET: 1 },
    contentTypeCounts: { "text/plain": 1 },
    contentSizeBucketCounts: {},
    serverIPCounts: {},
    uniqueUrlCount: 1,
    entries: [],
  };
}

describe("shell EmptyState", () => {
  it("shows title and default home link", () => {
    render(<EmptyState title="No HAR data loaded" />);
    expect(screen.getByText("No HAR data loaded")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Upload HAR files/i }),
    ).toHaveAttribute("href", "/");
  });
});

describe("home InsightStrip", () => {
  it("renders the insight heading", () => {
    const insights: HomeInsights = {
      files: [
        {
          fileIndex: 0,
          fileName: "a.har",
          totalRequests: 10,
          totalContentSize: 1000,
          errorCount: 0,
          uniqueUrlCount: 5,
        },
      ],
      totalRequests: 10,
      totalContentSize: 1000,
      totalErrors: 0,
      pair: null,
      cors: null,
    };
    render(<InsightStrip insights={insights} />);
    expect(
      screen.getByRole("heading", { name: "What to look at" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open file performance/i }),
    ).toBeInTheDocument();
  });
});

describe("home PrivacyBanner", () => {
  it("shows credentials notice until dismissed state loads", async () => {
    window.localStorage.removeItem("har_privacy_banner_dismissed");
    render(<PrivacyBanner />);
    expect(
      await screen.findByText(/HARs can contain credentials/i),
    ).toBeInTheDocument();
  });
});

describe("kv-search landmarks", () => {
  it("PageTitle names the tool", () => {
    render(<KvPageTitle fileCount={2} scope="all" />);
    expect(
      screen.getByRole("heading", { name: /Header & Cookie Search/i }),
    ).toBeInTheDocument();
  });

  it("ResultsTable empty prompt when no input", () => {
    render(
      <ResultsTable
        hits={[]}
        analyses={[]}
        query={{
          name: "",
          value: "",
          url: "",
          mode: "contains",
          caseSensitive: false,
          scope: new Set(KV_LOCATIONS),
          file: "all",
          expand: "",
        }}
        setQuery={() => {}}
        hasInput={false}
      />,
    );
    expect(
      screen.getByText(/Enter a name or value to search/i),
    ).toBeInTheDocument();
  });
});

describe("cors landmark", () => {
  it("PageTitle names the tool", () => {
    const report: CorsReport = {
      files: [],
      crossOriginCount: 0,
      preflightCount: 0,
      failedPreflightCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    };
    render(
      <CorsPageTitle fileCount={1} report={report} scope="all" />,
    );
    expect(
      screen.getByRole("heading", { name: "CORS" }),
    ).toBeInTheDocument();
  });

  it("CorsRequestsTable empty copy when no entries", () => {
    render(
      <CorsRequestsTable
        files={[]}
        analyses={[]}
        query={{
          file: "all",
          severity: "all",
          origin: "",
          expand: "",
        }}
        setQuery={() => {}}
      />,
    );
    expect(
      screen.getByText(/No cross-origin or preflight requests/i),
    ).toBeInTheDocument();
  });
});

describe("performance-diff landmark", () => {
  it("PageTitle names the tool", () => {
    render(
      <DiffPageTitle
        base={stubAnalysis("base.har", 0)}
        cmp={stubAnalysis("cmp.har", 1)}
        match="full"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Side-by-side comparison" }),
    ).toBeInTheDocument();
  });
});

describe("ContentTypeSummary", () => {
  it("shows HAR vs header breakdown when sources disagree", () => {
    render(
      <ContentTypeSummary
        entry={{
          harFileIndex: 0,
          harFileName: "a.har",
          indexInFile: 0,
          url: "https://example.com/app.js",
          method: "GET",
          status: 200,
          statusText: "OK",
          contentType: "text/javascript",
          contentMimeType: "x-unknown",
          headerContentType: "text/javascript",
          contentTypeFromHeader: true,
          contentTypeSourcesAgree: false,
          contentSize: 0,
          bodySize: 0,
          time: 0,
          startedDateTime: "",
          requestHeaders: [],
          responseHeaders: [
            { name: "Content-Type", value: "text/javascript; charset=utf-8" },
          ],
          requestCookies: [],
          responseCookies: [],
          serverIPAddress: "",
          userAgent: "",
        }}
      />,
    );
    expect(screen.getByText(/HAR content.mimeType/i)).toBeInTheDocument();
    expect(screen.getByText(/x-unknown/)).toBeInTheDocument();
    expect(
      screen.getByText(/text\/javascript; charset=utf-8/),
    ).toBeInTheDocument();
  });
});

describe("content-diff landmark", () => {
  it("TruncationNotice renders truncation copy", () => {
    render(
      <TruncationNotice
        fullLength={50_000}
        showFull={false}
        onToggle={() => {}}
        label="Baseline"
      />,
    );
    expect(screen.getByText(/truncated/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show full content/i }),
    ).toBeInTheDocument();
  });
});

describe("anomalies landmark", () => {
  it("HubTitle names the tool", () => {
    render(
      <HubTitle
        fileCount={2}
        report={{
          files: [],
          status: { groups: [], pathGroupCount: 0, entryCount: 0 },
          size: { groups: [], pathGroupCount: 0, entryCount: 0 },
          encoding: { groups: [], pathGroupCount: 0, entryCount: 0 },
          cachePolicy: { groups: [], pathGroupCount: 0, entryCount: 0 },
          uniquePathCount: 3,
          correlations: [],
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Anomalies" }),
    ).toBeInTheDocument();
  });
});

describe("cache-validator landmark", () => {
  it("PageTitle names the tool", () => {
    render(
      <CacheValidatorPageTitle
        fileCount={1}
        report={{
          files: [],
          groups: [],
          noValidatorGroups: [],
          pathConflictCount: 2,
          entryCount: 5,
          noValidatorPathCount: 0,
        }}
        visibleGroupCount={2}
        scope="all"
        showNoValidator={false}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Cache validator" }),
    ).toBeInTheDocument();
  });
});

describe("mime-mismatch landmark", () => {
  it("PageTitle names the tool", () => {
    render(
      <MimePageTitle
        fileCount={1}
        report={{
          files: [],
          mismatchCount: 2,
          unverifiedCount: 1,
          withExtensionCount: 10,
        }}
        visibleCount={2}
        scope="all"
        showUnverified={false}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "MIME mismatch" }),
    ).toBeInTheDocument();
  });
});

describe("shared UrlPathPicker", () => {
  it("shows search label and Match full URL control", () => {
    render(
      <UrlPathPicker
        urlInput=""
        onUrlInputChange={() => {}}
        matchExactUrl={false}
        onMatchExactUrlChange={() => {}}
        showDropdown={false}
        onShowDropdownChange={() => {}}
        urlGroups={[]}
        onSelect={() => {}}
        onClear={() => {}}
        selectedUrl={null}
      />,
    );
    expect(screen.getByText(/Search by path/i)).toBeInTheDocument();
    expect(screen.getByText(/Match full URL/i)).toBeInTheDocument();
  });
});
