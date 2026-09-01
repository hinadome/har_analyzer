import type { EntryRecord, HarAnalysis, HarHeader } from "@/types/har";

export const PRIVACY_BANNER_KEY = "har_privacy_banner_dismissed";
export const REDACT_SECRETS_KEY = "har_redact_secrets";

/** Placeholder written in place of redacted values. */
export const REDACTED = "[REDACTED]";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
]);

/** Query param names (lowercase) whose values are masked when redacting URLs. */
export const SENSITIVE_QUERY_PARAMS = new Set([
  "access_token",
  "id_token",
  "refresh_token",
  "token",
  "auth",
  "authorization",
  "api_key",
  "apikey",
  "api-key",
  "password",
  "passwd",
  "secret",
  "client_secret",
  "session",
  "sessionid",
  "sid",
]);

export function isPrivacyBannerDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage?.getItem(PRIVACY_BANNER_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPrivacyBanner(): void {
  try {
    window.localStorage?.setItem(PRIVACY_BANNER_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function isRedactSecretsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(REDACT_SECRETS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRedactSecretsEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage?.setItem(REDACT_SECRETS_KEY, "1");
    else window.localStorage?.removeItem(REDACT_SECRETS_KEY);
  } catch {
    /* private mode */
  }
}

export function isSensitiveHeaderName(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.trim().toLowerCase());
}

export function redactHeaders(headers: HarHeader[]): HarHeader[] {
  return headers.map((h) =>
    isSensitiveHeaderName(h.name) ? { ...h, value: REDACTED } : h,
  );
}

export function redactCookies(
  cookies: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  return cookies.map((c) => ({ ...c, value: REDACTED }));
}

/** Mask sensitive query-string values; leave path/host intact. */
export function redactUrl(url: string): string {
  if (!url || !url.includes("?")) return url;
  try {
    const u = new URL(url);
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        u.searchParams.set(key, REDACTED);
        changed = true;
      }
    }
    return changed ? u.toString() : url;
  } catch {
    // Relative or malformed — best-effort replace on known keys.
    return url.replace(
      /([?&])([^=&#]+)=([^&#]*)/gi,
      (full, sep: string, key: string, _val: string) => {
        if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
          return `${sep}${key}=${REDACTED}`;
        }
        return full;
      },
    );
  }
}

/** Remove persisted / in-memory response bodies from an entry. */
export function stripEntryBodies(entry: EntryRecord): EntryRecord {
  if (
    !entry.hasResponseBody &&
    entry.bodyId === undefined &&
    entry.responseContent === undefined
  ) {
    return entry;
  }
  const { responseContent: _c, bodyId: _b, ...rest } = entry;
  return {
    ...rest,
    hasResponseBody: false,
    responseContent: undefined,
    bodyId: undefined,
  };
}

export function stripAnalysisBodies(analysis: HarAnalysis): HarAnalysis {
  return {
    ...analysis,
    entries: analysis.entries.map(stripEntryBodies),
  };
}

export function stripStoreBodies(store: { analyses: HarAnalysis[] }): {
  analyses: HarAnalysis[];
} {
  return {
    analyses: store.analyses.map(stripAnalysisBodies),
  };
}

export function redactEntry(entry: EntryRecord): EntryRecord {
  return stripEntryBodies({
    ...entry,
    url: redactUrl(entry.url),
    requestHeaders: redactHeaders(entry.requestHeaders),
    responseHeaders: redactHeaders(entry.responseHeaders),
    requestCookies: redactCookies(entry.requestCookies),
    responseCookies: redactCookies(entry.responseCookies),
  });
}

export function redactAnalysis(analysis: HarAnalysis): HarAnalysis {
  return {
    ...analysis,
    entries: analysis.entries.map(redactEntry),
  };
}
