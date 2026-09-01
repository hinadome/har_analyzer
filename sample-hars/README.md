# Sample HAR files

Small captures for manual smoke tests and automated fixture checks. Upload in the app or reference in docs (`DEPLOYMENT.md`).

## General samples

| File | Purpose |
| ---- | ------- |
| `sample-a.har` | Typical API-style traffic (JSON, multiple endpoints) |
| `sample-b.har` | Second file for pair diff / cross-file views |
| `sample-c.har` | Third file for multi-file dashboards |

These are **clean** captures — they do not intentionally trigger audit findings.

## Audit fixture (`fixture-audits.har`)

Single-file fixture with **intentional** triggers for MIME mismatch, cache validator, anomalies, and Content-Type resolution. Regenerate after editing rules:

```bash
node scripts/generate-fixture-audits.mjs
```

Host: `https://fixture.example` — pathname grouping ignores query strings.

| Pathname | Trigger | Expected tool |
| -------- | ------- | ------------- |
| `/api/data.json` | `.json` URL, `text/html` Content-Type | MIME mismatch |
| `/api/foo` | HTTP 200 and 404 on same path | Anomalies → Status |
| `/asset.bin` | `content.size` 5 KB vs 20 KB (4× ratio) | Anomalies → Size drift |
| `/js/app.js` | `gzip` vs `br` Content-Encoding | Anomalies → Encoding (drift) |
| `/export/large.json` | 60 KB JSON, no Content-Encoding | Anomalies → Encoding (large plain) |
| `/page` | Different Cache-Control and Vary | Anomalies → Cache policy |
| `/static/logo.png` | ETag `"logo-v1"` vs `W/"logo-v1"`; different Last-Modified | Cache validator |
| `/bundle/app.mjs` | HAR `mimeType` `x-unknown`, header `text/javascript` | Entry detail Content-Type split |

### Quick manual smoke

1. Upload `fixture-audits.har` at `/`.
2. Tools: **MIME mismatch** (badge), **Cache validator** (badge), **Anomalies** (badge).
3. Open `/anomalies` — hub shows four category cards with counts; correlation strip lists paths with multiple checks.
4. Open `/entry/[file]/[index]` for the `/bundle/app.mjs` row — HAR vs header Content-Type note.

Automated coverage: `__tests__/fixtureAudits.test.ts`.

### Anomaly thresholds (reference)

Defined in `utils/anomalies/analyze.ts` (not configurable at deploy time):

| Check | Flag when |
| ----- | --------- |
| Status | ≥2 entries on pathname, distinct status codes |
| Size drift | ≥2 entries with `content.size` > 0, max/min ≥ **2** or max − min ≥ **10 KB** |
| Encoding drift | ≥2 entries, distinct `Content-Encoding` (missing = identity) |
| Large uncompressed | ≥1 entry: compressible type, no encoding, `content.size` ≥ **50 KB** |
| Cache policy | ≥2 entries, >1 distinct `Cache-Control` or `Vary` among entries that send each header |
