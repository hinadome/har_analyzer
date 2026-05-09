import type { EntryRecord, HarAnalysis, HarHeader } from "@/types/har";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CorsFindingKind =
  | "preflight-failed"
  | "preflight-slow"
  | "acao-missing"
  | "acao-mismatch"
  | "acao-wildcard-with-credentials"
  | "method-not-allowed"
  | "header-not-allowed"
  | "credentials-flag-missing"
  | "actual-request-blocked";

export type CorsSeverity = "error" | "warning" | "info";

export interface CorsFinding {
  kind: CorsFindingKind;
  severity: CorsSeverity;
  /** Short, human-readable summary. */
  message: string;
  /** Optional triplet for the handshake panel: what was sent / expected / received. */
  detail?: { sent?: string; expected?: string; received?: string };
}

export interface CorsEntry {
  /** Index into the file's entries array (stable identifier). */
  entryIndex: number;
  /** File index this entry belongs to. */
  fileIndex: number;
  entry: EntryRecord;
  isPreflight: boolean;
  /** Origin of the request (request URL's scheme://host[:port]). */
  targetOrigin: string;
  /** Value of the Origin request header (the calling page's origin). */
  requestOrigin: string;
  /** Whether the actual (non-preflight) request carried Cookie/Authorization. */
  credentialed: boolean;
  findings: CorsFinding[];
}

export interface CorsPair {
  preflight: CorsEntry;
  actual: CorsEntry | null;
}

export interface CorsFileReport {
  fileIndex: number;
  fileName: string;
  crossOriginCount: number;
  preflightCount: number;
  failedPreflightCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  entries: CorsEntry[];
  pairs: CorsPair[];
}

export interface CorsReport {
  files: CorsFileReport[];
  crossOriginCount: number;
  preflightCount: number;
  failedPreflightCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PREFLIGHT_SLOW_MS = 1000;
/** Max gap (ms) between preflight start and actual request start to be paired. */
export const PREFLIGHT_PAIR_WINDOW_MS = 5000;

// Headers shown in the handshake panel and used by the analyzer
export const CORS_REQUEST_HEADERS = [
  "Origin",
  "Access-Control-Request-Method",
  "Access-Control-Request-Headers",
] as const;

export const CORS_RESPONSE_HEADERS = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Credentials",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
] as const;

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

/**
 * Case-insensitive lookup that joins multi-value occurrences with ", ".
 * Returns undefined if no header with that name exists.
 */
export function getHeader(
  headers: HarHeader[],
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  const matches: string[] = [];
  for (const h of headers) {
    if (h.name.toLowerCase() === target) matches.push(h.value);
  }
  if (matches.length === 0) return undefined;
  return matches.join(", ");
}

/** Split a comma-separated header value into trimmed lowercase tokens. */
export function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/** Best-effort origin extraction from a URL. Returns "" on parse failure. */
export function urlOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Origin of the value carried by an `Origin` header (e.g. "https://app.com"). */
export function originHeaderOrigin(value: string | undefined): string {
  if (!value) return "";
  // The Origin header is itself an origin, but be defensive.
  const trimmed = value.trim();
  if (trimmed === "null") return "null";
  return urlOrigin(trimmed) || trimmed;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * A CORS request is one whose Origin header is present and whose origin
 * differs from the request URL's origin. Same-origin requests do not
 * trigger CORS and are excluded from the audit.
 */
export function isCrossOrigin(entry: EntryRecord): boolean {
  const origin = getHeader(entry.requestHeaders, "Origin");
  if (!origin) return false;
  const reqOrigin = originHeaderOrigin(origin);
  if (!reqOrigin) return false;
  if (reqOrigin === "null") return true;
  const target = urlOrigin(entry.url);
  if (!target) return false;
  return reqOrigin !== target;
}

/** OPTIONS request that carries an Access-Control-Request-Method header. */
export function isPreflight(entry: EntryRecord): boolean {
  if (entry.method.toUpperCase() !== "OPTIONS") return false;
  return (
    getHeader(entry.requestHeaders, "Access-Control-Request-Method") !==
    undefined
  );
}

/** Actual (non-preflight) requests are credentialed if they carry Cookie/Authorization. */
export function isCredentialed(entry: EntryRecord): boolean {
  const cookie = getHeader(entry.requestHeaders, "Cookie");
  const auth = getHeader(entry.requestHeaders, "Authorization");
  return Boolean(cookie || auth);
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

function entryStartMs(e: EntryRecord): number {
  const t = Date.parse(e.startedDateTime);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Pair preflight (OPTIONS) requests with the actual request that follows
 * them, matching by (URL, ACRM-method) within PREFLIGHT_PAIR_WINDOW_MS of
 * the preflight's startedDateTime. Each actual request is consumed by at
 * most one preflight; preflights without a match get `actual: null`.
 */
export function pairPreflights(corsEntries: CorsEntry[]): CorsPair[] {
  const preflights = corsEntries.filter((c) => c.isPreflight);
  const actuals = corsEntries
    .filter((c) => !c.isPreflight)
    .map((c) => ({ c, used: false }));
  const pairs: CorsPair[] = [];
  for (const p of preflights) {
    const acrm = (
      getHeader(p.entry.requestHeaders, "Access-Control-Request-Method") ?? ""
    ).toUpperCase();
    const pStart = entryStartMs(p.entry);
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < actuals.length; i++) {
      const a = actuals[i];
      if (a.used) continue;
      if (a.c.entry.url !== p.entry.url) continue;
      if (a.c.entry.method.toUpperCase() !== acrm) continue;
      const aStart = entryStartMs(a.c.entry);
      const delta = aStart - pStart;
      if (delta < 0) continue;
      if (delta > PREFLIGHT_PAIR_WINDOW_MS) continue;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      actuals[bestIdx].used = true;
      pairs.push({ preflight: p, actual: actuals[bestIdx].c });
    } else {
      pairs.push({ preflight: p, actual: null });
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Per-entry checks
// ---------------------------------------------------------------------------

function checkPreflight(entry: EntryRecord): CorsFinding[] {
  const findings: CorsFinding[] = [];
  const status = entry.status;
  if (status === 0 || status >= 400) {
    findings.push({
      kind: "preflight-failed",
      severity: "error",
      message:
        status === 0
          ? "Preflight failed — request never completed (status 0)"
          : `Preflight failed — server returned ${status}`,
      detail: { received: String(status) },
    });
  }
  if (entry.time > PREFLIGHT_SLOW_MS) {
    findings.push({
      kind: "preflight-slow",
      severity: "warning",
      message: `Preflight took ${Math.round(entry.time)} ms (> ${PREFLIGHT_SLOW_MS} ms threshold)`,
      detail: { received: `${Math.round(entry.time)} ms` },
    });
  }
  return findings;
}

function checkAcao(
  requestOrigin: string,
  acao: string | undefined,
  credentialed: boolean,
): CorsFinding[] {
  const findings: CorsFinding[] = [];
  if (!acao) {
    findings.push({
      kind: "acao-missing",
      severity: "error",
      message: "Response is missing Access-Control-Allow-Origin",
      detail: { sent: requestOrigin, expected: requestOrigin || "*" },
    });
    return findings;
  }
  const value = acao.trim();
  if (value === "*") {
    if (credentialed) {
      findings.push({
        kind: "acao-wildcard-with-credentials",
        severity: "error",
        message:
          "Access-Control-Allow-Origin: * is invalid for credentialed requests",
        detail: { sent: requestOrigin, received: "*" },
      });
    }
    return findings;
  }
  // Literal origin (or "null"). Must match Origin exactly.
  if (requestOrigin && value !== requestOrigin) {
    findings.push({
      kind: "acao-mismatch",
      severity: "error",
      message: `Access-Control-Allow-Origin does not match request Origin`,
      detail: { sent: requestOrigin, expected: requestOrigin, received: value },
    });
  }
  return findings;
}

function checkAllowedMethod(
  requestedMethod: string,
  acam: string | undefined,
): CorsFinding | null {
  const allowed = splitCsv(acam);
  if (allowed.includes("*")) return null;
  if (!allowed.includes(requestedMethod.toLowerCase())) {
    return {
      kind: "method-not-allowed",
      severity: "error",
      message: `Method ${requestedMethod} not in Access-Control-Allow-Methods`,
      detail: {
        sent: requestedMethod,
        expected: requestedMethod,
        received: acam ?? "(not set)",
      },
    };
  }
  return null;
}

function checkAllowedHeaders(
  acrh: string | undefined,
  acah: string | undefined,
): CorsFinding | null {
  const requested = splitCsv(acrh);
  if (requested.length === 0) return null;
  const allowed = splitCsv(acah);
  if (allowed.includes("*")) return null;
  const missing = requested.filter((h) => !allowed.includes(h));
  if (missing.length === 0) return null;
  return {
    kind: "header-not-allowed",
    severity: "error",
    message: `Header${missing.length === 1 ? "" : "s"} ${missing.join(", ")} not in Access-Control-Allow-Headers`,
    detail: {
      sent: acrh ?? "",
      expected: requested.join(", "),
      received: acah ?? "(not set)",
    },
  };
}

function checkCredentialsFlag(
  credentialed: boolean,
  acac: string | undefined,
): CorsFinding | null {
  if (!credentialed) return null;
  if ((acac ?? "").trim().toLowerCase() === "true") return null;
  return {
    kind: "credentials-flag-missing",
    severity: "error",
    message:
      "Credentialed request needs Access-Control-Allow-Credentials: true",
    detail: { expected: "true", received: acac ?? "(not set)" },
  };
}

// ---------------------------------------------------------------------------
// Public analyzer
// ---------------------------------------------------------------------------

/**
 * Build a CorsEntry shell (no findings yet). Caller fills `findings` after
 * pairing context is known (because some findings depend on the paired
 * request, e.g. `actual-request-blocked` and credentialed-actual checks
 * driving the preflight's allow-headers verdict).
 */
function buildCorsEntry(
  entry: EntryRecord,
  fileIndex: number,
  entryIndex: number,
): CorsEntry {
  const requestOrigin = originHeaderOrigin(
    getHeader(entry.requestHeaders, "Origin"),
  );
  const targetOrigin = urlOrigin(entry.url);
  return {
    fileIndex,
    entryIndex,
    entry,
    isPreflight: isPreflight(entry),
    requestOrigin,
    targetOrigin,
    credentialed: isCredentialed(entry),
    findings: [],
  };
}

/**
 * Run all CORS checks on a single CorsEntry, optionally with a paired
 * counterpart: when called on a preflight, `paired` is the actual request
 * (used to determine whether the actual request is credentialed); when
 * called on an actual request, `paired` is the preflight (used to flag
 * `actual-request-blocked` when the preflight failed).
 */
export function analyzeEntry(
  ce: CorsEntry,
  paired: CorsEntry | null,
): CorsFinding[] {
  const findings: CorsFinding[] = [];
  const reqHeaders = ce.entry.requestHeaders;
  const resHeaders = ce.entry.responseHeaders;
  const acao = getHeader(resHeaders, "Access-Control-Allow-Origin");
  const acam = getHeader(resHeaders, "Access-Control-Allow-Methods");
  const acah = getHeader(resHeaders, "Access-Control-Allow-Headers");
  const acac = getHeader(resHeaders, "Access-Control-Allow-Credentials");

  if (ce.isPreflight) {
    findings.push(...checkPreflight(ce.entry));
    // ACAO check uses paired actual's credentialed flag if available,
    // because preflights themselves don't carry cookies.
    const credentialed = paired?.credentialed ?? false;
    findings.push(...checkAcao(ce.requestOrigin, acao, credentialed));
    const acrm = getHeader(reqHeaders, "Access-Control-Request-Method");
    if (acrm) {
      const m = checkAllowedMethod(acrm, acam);
      if (m) findings.push(m);
    }
    const acrh = getHeader(reqHeaders, "Access-Control-Request-Headers");
    const h = checkAllowedHeaders(acrh, acah);
    if (h) findings.push(h);
    if (credentialed) {
      const c = checkCredentialsFlag(true, acac);
      if (c) findings.push(c);
    }
  } else {
    findings.push(...checkAcao(ce.requestOrigin, acao, ce.credentialed));
    const c = checkCredentialsFlag(ce.credentialed, acac);
    if (c) findings.push(c);
    if (paired && paired.isPreflight) {
      const preflightFailed = paired.findings.some(
        (f) => f.kind === "preflight-failed",
      );
      if (preflightFailed) {
        findings.push({
          kind: "actual-request-blocked",
          severity: "warning",
          message: "Actual request follows a failed preflight",
        });
      }
    }
  }
  return findings;
}

function buildFileReport(
  analysis: HarAnalysis,
  fileIndex: number,
): CorsFileReport {
  const corsEntries: CorsEntry[] = [];
  for (let i = 0; i < analysis.entries.length; i++) {
    const e = analysis.entries[i];
    if (!isCrossOrigin(e) && !isPreflight(e)) continue;
    corsEntries.push(buildCorsEntry(e, fileIndex, i));
  }
  const pairs = pairPreflights(corsEntries);
  const pairByPreflight = new Map<CorsEntry, CorsEntry | null>();
  const pairByActual = new Map<CorsEntry, CorsEntry>();
  for (const p of pairs) {
    pairByPreflight.set(p.preflight, p.actual);
    if (p.actual) pairByActual.set(p.actual, p.preflight);
  }
  // Two passes: preflights first (so actuals can read preflight findings).
  for (const ce of corsEntries) {
    if (ce.isPreflight) {
      ce.findings = analyzeEntry(ce, pairByPreflight.get(ce) ?? null);
    }
  }
  for (const ce of corsEntries) {
    if (!ce.isPreflight) {
      ce.findings = analyzeEntry(ce, pairByActual.get(ce) ?? null);
    }
  }
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let preflightCount = 0;
  let failedPreflightCount = 0;
  for (const ce of corsEntries) {
    if (ce.isPreflight) {
      preflightCount++;
      if (ce.findings.some((f) => f.kind === "preflight-failed")) {
        failedPreflightCount++;
      }
    }
    for (const f of ce.findings) {
      if (f.severity === "error") errorCount++;
      else if (f.severity === "warning") warningCount++;
      else infoCount++;
    }
  }
  return {
    fileIndex,
    fileName: analysis.fileName,
    crossOriginCount: corsEntries.filter((c) => !c.isPreflight).length,
    preflightCount,
    failedPreflightCount,
    errorCount,
    warningCount,
    infoCount,
    entries: corsEntries,
    pairs,
  };
}

/**
 * Build a complete CORS report across every loaded HAR file. Same-origin
 * requests are excluded; per-file findings are aggregated into top-level
 * counts.
 */
export function analyzeStore(analyses: HarAnalysis[]): CorsReport {
  const files: CorsFileReport[] = [];
  let crossOriginCount = 0;
  let preflightCount = 0;
  let failedPreflightCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < analyses.length; i++) {
    const r = buildFileReport(analyses[i], i);
    files.push(r);
    crossOriginCount += r.crossOriginCount;
    preflightCount += r.preflightCount;
    failedPreflightCount += r.failedPreflightCount;
    errorCount += r.errorCount;
    warningCount += r.warningCount;
    infoCount += r.infoCount;
  }
  return {
    files,
    crossOriginCount,
    preflightCount,
    failedPreflightCount,
    errorCount,
    warningCount,
    infoCount,
  };
}

/** Stable identifier for a single CORS entry, used in URL `?expand=`. */
export function corsEntryId(ce: CorsEntry): string {
  return `${ce.fileIndex}:${ce.entryIndex}`;
}
