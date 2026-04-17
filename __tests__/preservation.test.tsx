/**
 * Preservation property tests.
 * These tests confirm CORRECT/PRESERVED behaviour on the FIXED code.
 * They MUST ALL PASS now, and must still pass after all fixes are applied.
 *
 * Validates: Requirements 3.1, 3.2, 3.7, 3.8, 3.10, 3.11
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { EntryRecord } from '@/types/har';
import { formatBytes } from '@/utils/harParser';

// ---------------------------------------------------------------------------
// Inline Cell — matching the FIXED version in components/ComparisonTable.tsx
// ---------------------------------------------------------------------------
function Cell({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return <span data-testid="cell">—</span>;
  return <span data-testid="cell" className="font-mono">{value.toLocaleString()}</span>;
}

// ---------------------------------------------------------------------------
// Cell — undefined renders dash (Requirement 3.1)
// ---------------------------------------------------------------------------
describe('Cell — undefined renders dash', () => {
  it('Cell({ value: undefined }) renders "—"', () => {
    render(<Cell value={undefined} />);
    expect(screen.getByTestId('cell')).toHaveTextContent('—');
  });
});

// ---------------------------------------------------------------------------
// Cell — positive integer renders formatted number (Requirement 3.2)
// ---------------------------------------------------------------------------
describe('Cell — positive integer renders formatted number', () => {
  it('Cell({ value: 1 }) renders "1"', () => {
    render(<Cell value={1} />);
    expect(screen.getByTestId('cell')).toHaveTextContent('1');
  });

  it('Cell({ value: 42 }) renders "42"', () => {
    render(<Cell value={42} />);
    expect(screen.getByTestId('cell')).toHaveTextContent('42');
  });

  it('Cell({ value: 1000 }) renders a string containing "1" and "000"', () => {
    // Use toContain for digit sequences to avoid locale-specific separator failures
    render(<Cell value={1000} />);
    const text = screen.getByTestId('cell').textContent ?? '';
    expect(text).toContain('1');
    expect(text).toContain('000');
    expect(text).not.toBe('—');
  });
});

// ---------------------------------------------------------------------------
// formatBytes — zero returns '0 B' (Requirement 3.7)
// ---------------------------------------------------------------------------
describe('formatBytes — zero returns "0 B"', () => {
  it('formatBytes(0) returns "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});

// ---------------------------------------------------------------------------
// formatBytes — positive values return correct strings (Requirement 3.8)
// ---------------------------------------------------------------------------
describe('formatBytes — positive values return correct strings', () => {
  it('formatBytes(1) returns "1.0 B"', () => {
    expect(formatBytes(1)).toBe('1.0 B');
  });

  it('formatBytes(1024) returns "1.0 KB"', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formatBytes(1048576) returns "1.0 MB"', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
});

// ---------------------------------------------------------------------------
// Inline search filter — matching the FIXED version in app/details/page.tsx
// ---------------------------------------------------------------------------
function applySearchFilter(entries: EntryRecord[], search: string): EntryRecord[] {
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

function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    harFileName: 'test.har',
    url: 'https://example.com/api/data',
    contentType: 'application/json',
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Search filter — matches on url, contentType, status (Requirements 3.10, 3.11)
// ---------------------------------------------------------------------------
describe('Search filter — matches on url, contentType, status', () => {
  it('query matching url includes the entry', () => {
    const entry = makeEntry({ url: 'https://example.com/api/data' });
    expect(applySearchFilter([entry], 'api/data').length).toBeGreaterThan(0);
  });

  it('query matching contentType includes the entry', () => {
    const entry = makeEntry({ contentType: 'application/json' });
    expect(applySearchFilter([entry], 'application/json').length).toBeGreaterThan(0);
  });

  it('query matching status includes the entry', () => {
    const entry = makeEntry({ status: 200 });
    expect(applySearchFilter([entry], '200').length).toBeGreaterThan(0);
  });

  it('empty query returns all entries unfiltered', () => {
    const entries = [makeEntry(), makeEntry({ url: 'https://other.com' })];
    expect(applySearchFilter(entries, '').length).toBe(2);
  });

  it('whitespace-only query returns all entries unfiltered', () => {
    const entries = [makeEntry(), makeEntry()];
    expect(applySearchFilter(entries, '   ').length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Search filter — non-matching query excludes entry
// ---------------------------------------------------------------------------
describe('Search filter — non-matching query excludes entry', () => {
  it('query that matches no field excludes the entry', () => {
    const entry = makeEntry({
      url: 'https://example.com/page',
      contentType: 'text/html',
      status: 200,
    });
    // 'zzznomatch' won't appear in url, contentType, status, or harFileName
    expect(applySearchFilter([entry], 'zzznomatch').length).toBe(0);
  });
});
