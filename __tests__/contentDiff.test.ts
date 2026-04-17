/**
 * Tests for utils/contentDiff.ts
 * Covers: isBinaryEntry, prettifyIfJson, truncateBody, entryId, computeDiff
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isBinaryEntry,
  prettifyIfJson,
  truncateBody,
  entryId,
  computeDiff,
  TRUNCATION_LIMIT,
} from '@/utils/contentDiff';
import type { EntryRecord } from '@/types/har';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    url: 'https://example.com/api',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    contentType: 'text/plain',
    contentSize: 0,
    bodySize: 0,
    time: 100,
    timings: { send: 1, wait: 50, receive: 49 },
    harFileName: 'test.har',
    harFileIndex: 0,
    requestHeaders: [],
    responseHeaders: [],
    requestCookies: [],
    responseCookies: [],
    serverIPAddress: '',
    userAgent: '',
    responseContent: '',
    startedDateTime: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 3.1 — Unit tests
// ---------------------------------------------------------------------------

describe('isBinaryEntry', () => {
  it('returns true when responseContent is undefined', () => {
    expect(isBinaryEntry(makeEntry({ responseContent: undefined }))).toBe(true);
  });

  it.each([
    'image/png',
    'image/jpeg',
    'audio/mpeg',
    'video/mp4',
    'font/woff2',
    'application/octet-stream',
    'application/zip',
    'application/pdf',
  ])('returns true for binary MIME type %s', (contentType) => {
    expect(isBinaryEntry(makeEntry({ contentType, responseContent: 'data' }))).toBe(true);
  });

  it.each([
    ['text/html', '<html/>'],
    ['application/json', '{}'],
    ['text/plain', 'hello'],
  ])('returns false for %s with defined responseContent', (contentType, responseContent) => {
    expect(isBinaryEntry(makeEntry({ contentType, responseContent }))).toBe(false);
  });
});

describe('prettifyIfJson', () => {
  it('application/json with valid JSON → wasPrettified true and formatted text', () => {
    const { text, wasPrettified } = prettifyIfJson('{"a":1}', 'application/json');
    expect(wasPrettified).toBe(true);
    expect(text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('application/json with invalid JSON → wasPrettified false, text unchanged', () => {
    const original = '{not valid json}';
    const { text, wasPrettified } = prettifyIfJson(original, 'application/json');
    expect(wasPrettified).toBe(false);
    expect(text).toBe(original);
  });

  it('text/plain with valid JSON string → wasPrettified false', () => {
    const { wasPrettified } = prettifyIfJson('{"a":1}', 'text/plain');
    expect(wasPrettified).toBe(false);
  });

  it('content type ending in +json → wasPrettified true', () => {
    const { wasPrettified } = prettifyIfJson('{"x":2}', 'application/vnd.api+json');
    expect(wasPrettified).toBe(true);
  });
});

describe('truncateBody', () => {
  const short = 'hello';
  const long = 'x'.repeat(TRUNCATION_LIMIT + 1);

  it('body < TRUNCATION_LIMIT, showFull false → text unchanged, wasTruncated false', () => {
    const { text, wasTruncated } = truncateBody(short, false);
    expect(text).toBe(short);
    expect(wasTruncated).toBe(false);
  });

  it('body > TRUNCATION_LIMIT, showFull false → text.length === TRUNCATION_LIMIT, wasTruncated true', () => {
    const { text, wasTruncated } = truncateBody(long, false);
    expect(text.length).toBe(TRUNCATION_LIMIT);
    expect(wasTruncated).toBe(true);
  });

  it('body > TRUNCATION_LIMIT, showFull true → text unchanged, wasTruncated false', () => {
    const { text, wasTruncated } = truncateBody(long, true);
    expect(text).toBe(long);
    expect(wasTruncated).toBe(false);
  });

  it('fullLength always equals original body length', () => {
    expect(truncateBody(short, false).fullLength).toBe(short.length);
    expect(truncateBody(long, false).fullLength).toBe(long.length);
    expect(truncateBody(long, true).fullLength).toBe(long.length);
  });
});

describe('entryId', () => {
  it('two entries with different harFileIndex produce different IDs', () => {
    const a = makeEntry({ harFileIndex: 0 });
    const b = makeEntry({ harFileIndex: 1 });
    expect(entryId(a)).not.toBe(entryId(b));
  });

  it('two entries with different startedDateTime produce different IDs', () => {
    const a = makeEntry({ startedDateTime: '2024-01-01T00:00:00.000Z' });
    const b = makeEntry({ startedDateTime: '2024-06-01T00:00:00.000Z' });
    expect(entryId(a)).not.toBe(entryId(b));
  });

  it('same entry always produces the same ID', () => {
    const e = makeEntry();
    expect(entryId(e)).toBe(entryId(e));
  });
});

describe('computeDiff', () => {
  it('identical strings → identical true, all unifiedLines kind equal', () => {
    const result = computeDiff('hello\nworld', 'hello\nworld');
    expect(result.identical).toBe(true);
    expect(result.unifiedLines.every((l) => l.kind === 'equal')).toBe(true);
  });

  it('empty strings → identical true', () => {
    const result = computeDiff('', '');
    expect(result.identical).toBe(true);
  });

  it('one line changed → removed and added lines present', () => {
    const result = computeDiff('hello', 'world');
    const kinds = result.unifiedLines.map((l) => l.kind);
    expect(kinds).toContain('removed');
    expect(kinds).toContain('added');
  });

  it('intra-line spans concatenate back to original line text', () => {
    const result = computeDiff('hello world', 'hello there');
    const removed = result.leftLines.find((l) => l.kind === 'removed');
    expect(removed).toBeDefined();
    if (removed && removed.spans.length > 0) {
      expect(removed.spans.map((s) => s.text).join('')).toBe(removed.text);
    }
  });

  it('prettified flag is propagated', () => {
    const result = computeDiff('a', 'b', true);
    expect(result.prettified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3.2–3.8 — Property-based tests
// ---------------------------------------------------------------------------

const BINARY_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'font/',
  'application/octet-stream',
  'application/zip',
  'application/pdf',
] as const;

// Property 4 — Binary entry classification
// Validates: Requirements 4
describe('Property 4 — Binary entry classification', () => {
  it('entries with binary MIME prefix → isBinaryEntry true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BINARY_PREFIXES),
        fc.string(),
        (prefix, suffix) => {
          const entry = makeEntry({ contentType: prefix + suffix, responseContent: 'data' });
          return isBinaryEntry(entry) === true;
        }
      )
    );
  });

  it('entries with non-binary contentType and defined responseContent → isBinaryEntry false', () => {
    const nonBinaryType = fc.string({ minLength: 1 }).filter(
      (ct) => !BINARY_PREFIXES.some((p) => ct.startsWith(p))
    );
    fc.assert(
      fc.property(nonBinaryType, fc.string(), (contentType, responseContent) => {
        const entry = makeEntry({ contentType, responseContent });
        return isBinaryEntry(entry) === false;
      })
    );
  });
});

// Property 5 — Identity detection
// Validates: Requirements 5
describe('Property 5 — Identity detection', () => {
  it('computeDiff(s, s).identical === true and all unifiedLines kind equal', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = computeDiff(s, s);
        return (
          result.identical === true &&
          result.unifiedLines.every((l) => l.kind === 'equal')
        );
      })
    );
  });
});

// Property 6 — Diff line classification
// Validates: Requirements 6
describe('Property 6 — Diff line classification', () => {
  it('leftLines never contain added; rightLines never contain removed', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const result = computeDiff(a, b);
        const leftHasAdded = result.leftLines.some((l) => l.kind === 'added');
        const rightHasRemoved = result.rightLines.some((l) => l.kind === 'removed');
        return !leftHasAdded && !rightHasRemoved;
      })
    );
  });
});

// Property 7 — Line numbers strictly increasing
// Validates: Requirements 7
describe('Property 7 — Line numbers strictly increasing', () => {
  it('non-placeholder lines have lineNumber > 0 and strictly increasing within each panel', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const result = computeDiff(a, b);

        const nonPlaceholder = (lines: typeof result.leftLines) =>
          lines.filter((l) => l.kind !== 'placeholder');

        const allPositive = (lines: typeof result.leftLines) =>
          nonPlaceholder(lines).every((l) => l.lineNumber !== null && l.lineNumber > 0);

        const strictlyIncreasing = (lines: typeof result.leftLines) => {
          const nums = nonPlaceholder(lines)
            .map((l) => l.lineNumber as number);
          for (let i = 1; i < nums.length; i++) {
            if (nums[i] <= nums[i - 1]) return false;
          }
          return true;
        };

        return (
          allPositive(result.leftLines) &&
          allPositive(result.rightLines) &&
          strictlyIncreasing(result.leftLines) &&
          strictlyIncreasing(result.rightLines)
        );
      })
    );
  });
});

// Property 8 — Intra-line spans reconstruct text
// Validates: Requirements 8
describe('Property 8 — Intra-line spans reconstruct text', () => {
  it('span texts concatenate back to the original line text', () => {
    // Single-line strings: no newlines
    const singleLine = fc.string().map((s) => s.replace(/\n/g, ''));

    fc.assert(
      fc.property(singleLine, singleLine, (a, b) => {
        if (a === b) return true; // identical → no removed/added lines
        const result = computeDiff(a, b);

        const removedLine = result.leftLines.find((l) => l.kind === 'removed');
        const addedLine = result.rightLines.find((l) => l.kind === 'added');

        if (removedLine && removedLine.spans.length > 0) {
          if (removedLine.spans.map((s) => s.text).join('') !== removedLine.text) return false;
        }
        if (addedLine && addedLine.spans.length > 0) {
          if (addedLine.spans.map((s) => s.text).join('') !== addedLine.text) return false;
        }
        return true;
      })
    );
  });
});

// Property 9 — JSON prettification round-trip
// Validates: Requirements 9
describe('Property 9 — JSON prettification round-trip', () => {
  it('prettifyIfJson on JSON.stringify(obj) always prettifies and round-trips', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (obj) => {
        const raw = JSON.stringify(obj);
        const { text, wasPrettified } = prettifyIfJson(raw, 'application/json');
        if (!wasPrettified) return false;
        try {
          const roundTripped = JSON.parse(text);
          return JSON.stringify(roundTripped) === JSON.stringify(obj);
        } catch {
          return false;
        }
      })
    );
  });
});

// Property 10 — Truncation
// Validates: Requirements 10
describe('Property 10 — Truncation', () => {
  it('body > TRUNCATION_LIMIT, showFull false → text.length === TRUNCATION_LIMIT, wasTruncated true', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: TRUNCATION_LIMIT + 1 }),
        (body) => {
          const { text, wasTruncated } = truncateBody(body, false);
          return text.length === TRUNCATION_LIMIT && wasTruncated === true;
        }
      )
    );
  });

  it('any body, showFull true → text === body, wasTruncated false', () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const { text, wasTruncated } = truncateBody(body, true);
        return text === body && wasTruncated === false;
      })
    );
  });

  it('body.length <= TRUNCATION_LIMIT, showFull false → text === body, wasTruncated false', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: TRUNCATION_LIMIT }),
        (body) => {
          const { text, wasTruncated } = truncateBody(body, false);
          return text === body && wasTruncated === false;
        }
      )
    );
  });
});
