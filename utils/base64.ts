/**
 * Base64 detection + decoding helpers for the entry-detail Content card.
 *
 * Goal: when a *non-binary* response body is actually a base64-encoded blob
 * of text (a common pattern for JSON/text payloads wrapped by proxies, SDKs,
 * or `data:` style transports), offer to show the decoded text instead of the
 * opaque base64 string. Detection is deliberately conservative to avoid
 * misfiring on ordinary text that happens to use base64's alphabet.
 */

/** Minimum length before we even consider a string base64 (avoids tiny words). */
export const MIN_BASE64_LENGTH = 16;

/** Strict standard base64 alphabet with optional `=` padding (whitespace stripped first). */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Remove characters that are legal to interleave in a base64 payload (line breaks / spaces). */
function stripWhitespace(s: string): string {
  return s.replace(/[\s]/g, "");
}

/**
 * Heuristic: does `text` look like standard base64-encoded data?
 *
 * Requirements (all must hold):
 * - after stripping whitespace, length ≥ `MIN_BASE64_LENGTH` and a multiple of 4
 * - only the standard base64 alphabet (`A–Z a–z 0–9 + /`) plus optional padding
 * - padding (`=`) only at the very end, 0–2 chars
 * - it decodes cleanly to valid UTF-8 text (see `decodeBase64ToText`)
 *
 * The final decode check is what rejects the common false positives: a long
 * run of hex, a JWT-ish token, or random-looking text usually fails to decode
 * into valid, mostly-printable UTF-8.
 */
export function looksLikeBase64(text: string | null | undefined): boolean {
  if (!text) return false;
  const compact = stripWhitespace(text);
  if (compact.length < MIN_BASE64_LENGTH) return false;
  if (compact.length % 4 !== 0) return false;
  if (!BASE64_RE.test(compact)) return false;
  // Padding must only appear at the end.
  const firstPad = compact.indexOf("=");
  if (firstPad !== -1 && firstPad < compact.length - 2) return false;
  return decodeBase64ToText(compact) !== null;
}

/** True when a decoded string is "mostly printable" text rather than binary. */
function isLikelyText(decoded: string): boolean {
  if (decoded.length === 0) return false;
  let control = 0;
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    // Allow tab (9), LF (10), CR (13); flag other C0 controls and DEL.
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 127) control += 1;
    // U+FFFD replacement char means the UTF-8 decode was lossy → binary.
    if (code === 0xfffd) return false;
  }
  // Tolerate a tiny fraction of stray control bytes; reject if it's binary-ish.
  return control / decoded.length < 0.1;
}

/**
 * Decode a base64 string to UTF-8 text.
 *
 * Returns `null` when:
 * - the input is empty / not decodable by `atob`
 * - the decoded bytes are not valid UTF-8 (i.e. the payload is binary)
 * - the decoded text is control-char heavy (binary masquerading as base64)
 *
 * Whitespace in the input is ignored. Uses the Web `atob` + `TextDecoder`
 * (available in browsers and Node 18+); falls back to `null` if unavailable.
 */
export function decodeBase64ToText(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const compact = stripWhitespace(text);
  if (compact.length === 0 || compact.length % 4 !== 0) return null;

  let binary: string;
  try {
    if (typeof atob === "function") {
      binary = atob(compact);
    } else if (typeof Buffer !== "undefined") {
      // Node fallback (tests run in node env).
      const buf = Buffer.from(compact, "base64");
      // Round-trip guard: Buffer.from is lenient, so re-encode and compare.
      if (buf.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) {
        return null;
      }
      binary = buf.toString("binary");
    } else {
      return null;
    }
  } catch {
    return null;
  }

  // Bytes → UTF-8, failing on invalid sequences so binary payloads return null.
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }

  if (!isLikelyText(decoded)) return null;
  return decoded;
}
