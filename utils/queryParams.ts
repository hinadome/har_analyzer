/** Max length for `?expand=` deep-link ids (pathname or entry id). Oversized values are ignored. */
export const MAX_EXPAND_QUERY_LENGTH = 512;

/** Parse `?expand=` — returns empty string when missing or over length cap. */
export function parseExpandParam(raw: string | null | undefined): string {
  if (!raw) return "";
  if (raw.length > MAX_EXPAND_QUERY_LENGTH) return "";
  return raw;
}
