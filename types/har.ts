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
  responseContent?: string;
  startedDateTime: string;
}

export interface HarAnalysis {
  fileName: string;
  fileIndex: number;
  totalRequests: number;
  totalContentSize: number;
  statusCodeCounts: Record<number, number>;
  contentTypeCounts: Record<string, number>;
  contentSizeBucketCounts: Record<string, number>;
  serverIPCounts: Record<string, number>;
  uniqueUrlCount: number;
  entries: EntryRecord[];
}

export interface HarStore {
  analyses: HarAnalysis[];
}

export type DetailType = 'status' | 'url' | 'contentType' | 'contentSizeBucket' | 'serverIPAddress' | 'userAgent';
