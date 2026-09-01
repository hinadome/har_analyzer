/**
 * Generates sample-hars/fixture-audits.har — intentional triggers for audit tools.
 * Run: node scripts/generate-fixture-audits.mjs
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "https://fixture.example";

function entry({
  iso,
  url,
  status = 200,
  mimeType = "application/json",
  contentSize = 120,
  bodyText = "{}",
  responseHeaders = [],
}) {
  return {
    startedDateTime: iso,
    time: 48,
    request: {
      method: "GET",
      url,
      httpVersion: "HTTP/1.1",
      headers: [{ name: "Accept", value: "application/json" }],
      queryString: [],
      cookies: [],
      headersSize: 100,
      bodySize: 0,
    },
    response: {
      status,
      statusText: status === 200 ? "OK" : "Not Found",
      httpVersion: "HTTP/1.1",
      headers: responseHeaders,
      cookies: [],
      content: {
        size: contentSize,
        mimeType,
        text: bodyText,
      },
      redirectURL: "",
      headersSize: 80,
      bodySize: contentSize,
    },
    serverIPAddress: "127.0.0.1",
    timings: { send: 1, wait: 40, receive: 5 },
  };
}

const entries = [
  // MIME mismatch — .json path, HTML type
  entry({
    iso: "2026-01-15T10:00:00.000Z",
    url: `${HOST}/api/data.json`,
    mimeType: "text/html",
    responseHeaders: [
      { name: "Content-Type", value: "text/html; charset=utf-8" },
    ],
    bodyText: "<html><body>not json</body></html>",
    contentSize: 64,
  }),
  // Status anomaly — same pathname, different status
  entry({
    iso: "2026-01-15T10:00:01.000Z",
    url: `${HOST}/api/foo`,
    status: 200,
  }),
  entry({
    iso: "2026-01-15T10:00:02.000Z",
    url: `${HOST}/api/foo?q=1`,
    status: 404,
    mimeType: "text/html",
    responseHeaders: [{ name: "Content-Type", value: "text/html" }],
    contentSize: 32,
    bodyText: "not found",
  }),
  // Size drift — ratio 4× (5 KB vs 20 KB)
  entry({
    iso: "2026-01-15T10:00:03.000Z",
    url: `${HOST}/asset.bin`,
    mimeType: "application/octet-stream",
    contentSize: 5120,
    bodyText: "small",
  }),
  entry({
    iso: "2026-01-15T10:00:04.000Z",
    url: `${HOST}/asset.bin?v=2`,
    mimeType: "application/octet-stream",
    contentSize: 20480,
    bodyText: "larger payload",
  }),
  // Encoding drift — gzip vs br on same path
  entry({
    iso: "2026-01-15T10:00:05.000Z",
    url: `${HOST}/js/app.js`,
    mimeType: "text/javascript",
    responseHeaders: [
      { name: "Content-Type", value: "text/javascript" },
      { name: "Content-Encoding", value: "gzip" },
    ],
    contentSize: 800,
    bodyText: "console.log(1);",
  }),
  entry({
    iso: "2026-01-15T10:00:06.000Z",
    url: `${HOST}/js/app.js?b=2`,
    mimeType: "text/javascript",
    responseHeaders: [
      { name: "Content-Type", value: "text/javascript" },
      { name: "Content-Encoding", value: "br" },
    ],
    contentSize: 800,
    bodyText: "console.log(2);",
  }),
  // Large uncompressed — ≥50 KB JSON, no Content-Encoding
  entry({
    iso: "2026-01-15T10:00:07.000Z",
    url: `${HOST}/export/large.json`,
    mimeType: "application/json",
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    contentSize: 60000,
    bodyText: '{"data":"' + "x".repeat(200) + '"}',
  }),
  // Cache policy — Cache-Control + Vary drift
  entry({
    iso: "2026-01-15T10:00:08.000Z",
    url: `${HOST}/page`,
    mimeType: "text/html",
    responseHeaders: [
      { name: "Content-Type", value: "text/html" },
      { name: "Cache-Control", value: "max-age=3600, public" },
      { name: "Vary", value: "Accept-Encoding" },
    ],
    contentSize: 256,
    bodyText: "<html>v1</html>",
  }),
  entry({
    iso: "2026-01-15T10:00:09.000Z",
    url: `${HOST}/page?x=1`,
    mimeType: "text/html",
    responseHeaders: [
      { name: "Content-Type", value: "text/html" },
      { name: "Cache-Control", value: "no-cache, no-store" },
      { name: "Vary", value: "Origin" },
    ],
    contentSize: 256,
    bodyText: "<html>v2</html>",
  }),
  // Cache validator — ETag drift (weak vs strong same value + distinct)
  entry({
    iso: "2026-01-15T10:00:10.000Z",
    url: `${HOST}/static/logo.png`,
    mimeType: "image/png",
    responseHeaders: [
      { name: "Content-Type", value: "image/png" },
      { name: "ETag", value: '"logo-v1"' },
      { name: "Last-Modified", value: "Wed, 01 Jan 2026 00:00:00 GMT" },
    ],
    contentSize: 4096,
    bodyText: "PNG",
  }),
  entry({
    iso: "2026-01-15T10:00:11.000Z",
    url: `${HOST}/static/logo.png?v=2`,
    mimeType: "image/png",
    responseHeaders: [
      { name: "Content-Type", value: "image/png" },
      { name: "ETag", value: 'W/"logo-v1"' },
      { name: "Last-Modified", value: "Thu, 02 Jan 2026 00:00:00 GMT" },
    ],
    contentSize: 4096,
    bodyText: "PNG",
  }),
  // Content-Type resolution — x-unknown HAR mime, real header
  entry({
    iso: "2026-01-15T10:00:12.000Z",
    url: `${HOST}/bundle/app.mjs`,
    mimeType: "x-unknown",
    responseHeaders: [
      { name: "Content-Type", value: "text/javascript; charset=utf-8" },
    ],
    contentSize: 512,
    bodyText: "export default 1;",
  }),
];

const har = {
  log: {
    version: "1.2",
    creator: { name: "har-analyzer-fixture", version: "1.0" },
    comment:
      "Intentional audit triggers — see sample-hars/README.md",
    entries,
  },
};

const out = join(root, "sample-hars", "fixture-audits.har");
writeFileSync(out, JSON.stringify(har, null, 2) + "\n");
console.log(`Wrote ${out} (${entries.length} entries)`);
