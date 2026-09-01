export interface HarHeader {
  name: string;
  value: string;
}

export interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  compression?: number;
}

export interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HarHeader[];
  queryString: Array<{ name: string; value: string }>;
  cookies: Array<{ name: string; value: string }>;
  headersSize: number;
  bodySize: number;
}

export interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HarHeader[];
  cookies: Array<{ name: string; value: string }>;
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
}

export interface HarTimings {
  send: number;
  wait: number;
  receive: number;
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  serverIPAddress?: string;
  timings: HarTimings;
}

export interface HarLog {
  version: string;
  creator: {
    name: string;
    version: string;
  };
  entries: HarEntry[];
}

export interface HarFile {
  log: HarLog;
}

export interface EntryRecord {
  url: string;
  method: string;
  status: number;
  statusText: string;
  contentType: string;
  /** Normalized `response.content.mimeType` from the HAR. */
  contentMimeType: string;
  /** Normalized `Content-Type` response header when present. */
  headerContentType: string;
  /** Effective type uses header when HAR content MIME is junk (x-unknown, etc.). */
  contentTypeFromHeader: boolean;
  /** False when HAR content MIME and header disagree on a real type. */
  contentTypeSourcesAgree: boolean;
  contentSize: number;
  bodySize: number;
  time: number;
  timings: HarTimings;
  harFileName: string;
  harFileIndex: number;
  requestHeaders: HarHeader[];
  responseHeaders: HarHeader[];
  requestCookies: Array<{ name: string; value: string }>;
  responseCookies: Array<{ name: string; value: string }>;
  serverIPAddress: string;
  userAgent: string;
  /**
   * In-memory response body. Omitted from IndexedDB hot blob (v2+);
   * persisted under `bodyId` and loaded on demand.
   */
  responseContent?: string;
  /** True when a response body was captured at parse time. */
  hasResponseBody?: boolean;
  /** Stable ID for the cold body blob in IndexedDB (v2+). */
  bodyId?: string;
  /** Stable position within the parent HAR file (0-based). */
  indexInFile: number;
  startedDateTime: string;
}

export interface HarAnalysis {
  fileName: string;
  fileIndex: number;
  totalRequests: number;
  totalContentSize: number;
  statusCodeCounts: Record<number, number>;
  methodCounts: Record<string, number>;
  contentTypeCounts: Record<string, number>;
  contentSizeBucketCounts: Record<string, number>;
  serverIPCounts: Record<string, number>;
  uniqueUrlCount: number;
  entries: EntryRecord[];
}

/** Hot metadata blob. Bodies live under separate IDB keys (v2+). */
export interface HarStore {
  /** Schema version. Missing / &lt; 2 = legacy single-blob with inline bodies. */
  version?: number;
  analyses: HarAnalysis[];
}


export type DetailType =
  | "status"
  | "url"
  | "contentType"
  | "contentSizeBucket"
  | "serverIPAddress"
  | "userAgent"
  | "method";
