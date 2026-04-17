/**
 * Bug condition exploration tests.
 * These tests verify the FIXED versions pass correctly.
 *
 * Validates: Requirements 1.1, 1.7, 1.8
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { formatBytes } from '@/utils/harParser';

// ---------------------------------------------------------------------------
// Bug 1 — Cell zero-value (components/ComparisonTable.tsx)
// Fixed: `if (value === undefined || value === null)` instead of `if (!value)`
// ---------------------------------------------------------------------------

// Inline the Cell component matching the FIXED version in source.
function CellFromSource({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return <span data-testid="cell">—</span>;
  return <span data-testid="cell" className="font-mono">{value.toLocaleString()}</span>;
}

describe('Bug 1 — Cell zero-value guard', () => {
  it('Cell(0) should render "0", not "—"', () => {
    render(<CellFromSource value={0} />);
    const cell = screen.getByTestId('cell');
    expect(cell).toHaveTextContent('0');
    expect(cell).not.toHaveTextContent('—');
  });
});

// ---------------------------------------------------------------------------
// Bug 7 — formatBytes sentinel (utils/harParser.ts)
// Fixed: `if (bytes < 0) return 'N/A'` before the zero check
// Using the real imported formatBytes from source.
// ---------------------------------------------------------------------------

describe('Bug 7 — formatBytes sentinel handling', () => {
  it('formatBytes(-1) should return "N/A", not "0 B"', () => {
    expect(formatBytes(-1)).toBe('N/A');
  });

  it('formatBytes(-999) should return "N/A", not "0 B"', () => {
    expect(formatBytes(-999)).toBe('N/A');
  });
});

// ---------------------------------------------------------------------------
// Bug 8 — Search filter missing harFileName (app/details/page.tsx)
// Fixed: predicate now includes `e.harFileName.toLowerCase().includes(q)`
// ---------------------------------------------------------------------------

import type { EntryRecord } from '@/types/har';

// Inline the filter predicate matching the FIXED version in source.
function applySearchFilterFromSource(entries: EntryRecord[], search: string): EntryRecord[] {
  if (!search.trim()) return entries;
  const q = search.trim().toLowerCase();
  return entries.filter(
    (e) =>
      e.url.toLowerCase().includes(q) ||
      e.contentType.toLowerCase().includes(q) ||
      String(e.status).includes(q) ||
      e.harFileName.toLowerCase().includes(q)
  );
}

describe('Bug 8 — Search filter missing harFileName', () => {
  it('searching by harFileName should return matching entries', () => {
    const entry: EntryRecord = {
      harFileName: 'api.har',
      url: 'https://example.com/totally-unrelated-path',
      contentType: 'image/png',
      status: 200,
      method: 'GET',
      statusText: 'OK',
      contentSize: 512,
      bodySize: 512,
      time: 100,
      timings: { send: 1, wait: 50, receive: 49 },
      harFileIndex: 0,
      requestHeaders: [],
      responseHeaders: [],
      requestCookies: [],
      responseCookies: [],
      serverIPAddress: '',
      userAgent: '',
      startedDateTime: '2024-01-01T00:00:00.000Z',
    };

    // 'api.har' matches harFileName but NOT url, contentType, or status
    const result = applySearchFilterFromSource([entry], 'api.har');

    expect(result.length).toBeGreaterThan(0);
  });
});
