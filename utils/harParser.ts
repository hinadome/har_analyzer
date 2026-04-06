import { HarFile, HarAnalysis, EntryRecord, HarStore } from '@/types/har';

export async function parseHarFile(file: File): Promise<HarFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const har = JSON.parse(content) as HarFile;
        if (!har.log || !Array.isArray(har.log.entries)) {
          reject(new Error('Invalid HAR file format'));
          return;
        }
        resolve(har);
      } catch (err) {
        reject(new Error(`Failed to parse HAR file: ${err}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function normalizeContentType(mimeType: string): string {
  if (!mimeType) return 'unknown';
  return mimeType.split(';')[0].trim().toLowerCase();
}

// Parse "name=value; name2=value2" from a Cookie request header
function parseCookieHeader(value: string): Array<{ name: string; value: string }> {
  return value.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const idx = p.indexOf('=');
    if (idx === -1) return { name: p, value: '' };
    return { name: p.slice(0, idx).trim(), value: p.slice(idx + 1).trim() };
  });
}

// Parse the first "name=value" segment from a Set-Cookie response header
function parseSetCookieHeader(value: string): { name: string; value: string } {
  const first = value.split(';')[0].trim();
  const idx = first.indexOf('=');
  if (idx === -1) return { name: first, value: '' };
  return { name: first.slice(0, idx).trim(), value: first.slice(idx + 1).trim() };
}

export function analyzeHar(har: HarFile, fileName: string, fileIndex: number): HarAnalysis {
  const entries: EntryRecord[] = [];
  const statusCodeCounts: Record<number, number> = {};
  const contentTypeCounts: Record<string, number> = {};
  const contentSizeBucketCounts: Record<string, number> = {};
  const serverIPCounts: Record<string, number> = {};
  const uniqueUrls = new Set<string>();
  let totalContentSize = 0;
  for (const entry of har.log.entries) {
    const url = entry.request?.url ?? '';
    const method = entry.request?.method ?? '';
    const status = entry.response?.status ?? 0;
    const statusText = entry.response?.statusText ?? '';
    const contentType = normalizeContentType(entry.response?.content?.mimeType ?? '');
    const contentSize = entry.response?.content?.size ?? 0;
    const bodySize = entry.response?.bodySize ?? 0;
    const time = entry.time ?? 0;
    const startedDateTime = entry.startedDateTime ?? '';
    const requestHeaders = entry.request?.headers ?? [];
    const responseHeaders = entry.response?.headers ?? [];
    const serverIPAddress = entry.serverIPAddress ?? '';
    const userAgent = requestHeaders.find((h) => h.name.toLowerCase() === 'user-agent')?.value ?? '';
    const timings = entry.timings ?? { send: 0, wait: 0, receive: 0 };

    // Many HAR exporters leave the cookies array empty and rely on the
    // Cookie / Set-Cookie headers instead. Fall back to parsing those.
    let requestCookies = entry.request?.cookies ?? [];
    if (requestCookies.length === 0) {
      const cookieHeader = requestHeaders.find((h) => h.name.toLowerCase() === 'cookie');
      if (cookieHeader?.value) requestCookies = parseCookieHeader(cookieHeader.value);
    }

    let responseCookies = entry.response?.cookies ?? [];
    if (responseCookies.length === 0) {
      responseCookies = responseHeaders
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => parseSetCookieHeader(h.value));
    }

    const responseContent = entry.response?.content?.text;

    entries.push({ url, method, status, statusText, contentType, contentSize, bodySize, time, timings, harFileName: fileName, harFileIndex: fileIndex, requestHeaders, responseHeaders, requestCookies, responseCookies, serverIPAddress, userAgent, responseContent, startedDateTime });

    totalContentSize += contentSize;
    statusCodeCounts[status] = (statusCodeCounts[status] || 0) + 1;
    contentTypeCounts[contentType] = (contentTypeCounts[contentType] || 0) + 1;
    const bucket = getContentSizeBucket(contentSize);
    contentSizeBucketCounts[bucket] = (contentSizeBucketCounts[bucket] || 0) + 1;
    const ipKey = serverIPAddress || '(no IP)';
    serverIPCounts[ipKey] = (serverIPCounts[ipKey] || 0) + 1;
    uniqueUrls.add(url);
  }

  return {
    fileName,
    fileIndex,
    totalRequests: entries.length,
    totalContentSize,
    statusCodeCounts,
    contentTypeCounts,
    contentSizeBucketCounts,
    serverIPCounts,
    uniqueUrlCount: uniqueUrls.size,
    entries,
  };
}

export function buildHarStore(analyses: HarAnalysis[]): HarStore {
  return { analyses };
}

export function getAllStatusCodes(analyses: HarAnalysis[]): number[] {
  const codes = new Set<number>();
  for (const a of analyses) {
    for (const code of Object.keys(a.statusCodeCounts)) {
      codes.add(Number(code));
    }
  }
  return Array.from(codes).sort((a, b) => a - b);
}

export function getAllContentTypes(analyses: HarAnalysis[]): string[] {
  const types = new Set<string>();
  for (const a of analyses) {
    for (const ct of Object.keys(a.contentTypeCounts)) {
      types.add(ct);
    }
  }
  return Array.from(types).sort();
}

export function getAllServerIPs(analyses: HarAnalysis[]): string[] {
  const ips = new Set<string>();
  for (const a of analyses) {
    for (const ip of Object.keys(a.serverIPCounts ?? {})) {
      ips.add(ip);
    }
  }
  const sorted = Array.from(ips).filter((ip) => ip !== '(no IP)').sort();
  if (ips.has('(no IP)')) sorted.push('(no IP)');
  return sorted;
}

const CONTENT_SIZE_BUCKETS: Array<{ label: string; max: number }> = [
  { label: '0 B – 1 KB',     max: 1024 },
  { label: '1 KB – 10 KB',   max: 10 * 1024 },
  { label: '10 KB – 100 KB', max: 100 * 1024 },
  { label: '100 KB – 1 MB',  max: 1024 * 1024 },
  { label: '1 MB+',          max: Infinity },
];

export function getContentSizeBucket(bytes: number): string {
  for (const bucket of CONTENT_SIZE_BUCKETS) {
    if (bytes < bucket.max) return bucket.label;
  }
  return CONTENT_SIZE_BUCKETS[CONTENT_SIZE_BUCKETS.length - 1].label;
}

export function getContentSizeBuckets(): string[] {
  return CONTENT_SIZE_BUCKETS.map((b) => b.label);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[Math.min(i, units.length - 1)]}`;
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
