# Monitoring, Observability & Performance

Postpin is logistics infrastructure: when a customer's checkout calls `POST /v1/rates`, a slow or wrong answer directly costs them sales, so the platform must be observable to the millisecond and the rupee. This document specifies the three pillars — **metrics** (Prometheus + OpenTelemetry), **structured logs** (JSON with correlation/trace IDs), and **distributed traces** (API → MongoDB / Redis / BullMQ → India Post) — and ties them to **golden signals** and **per-module SLIs/SLOs** (rate API availability 99.95%, p99 rate-calc < 50 ms, India-Post sync success rate ≥ 99%). It then covers the **Grafana dashboards** and exactly what each shows, **alerting rules with on-call/escalation and error budgets**, **business observability** (MRR, churn, usage), **synthetic checks** for the rate API and the nightly sync, and a concrete **performance-optimization playbook** (profiling, query/index tuning, N+1 avoidance, cache-hit-rate targets). It is written to be built from directly — field lists, metric names, PromQL, alert thresholds, and trace spans are all concrete.

## Contents

- [1. Observability Architecture & Data Flow](#1-observability-architecture--data-flow)
- [2. Pillar 1 — Metrics (Prometheus + OpenTelemetry)](#2-pillar-1--metrics-prometheus--opentelemetry)
- [3. Pillar 2 — Structured Logs & Correlation IDs](#3-pillar-2--structured-logs--correlation-ids)
- [4. Pillar 3 — Distributed Tracing](#4-pillar-3--distributed-tracing)
- [5. Golden Signals & the RED/USE Model](#5-golden-signals--the-reduse-model)
- [6. Per-Module SLIs & SLOs](#6-per-module-slis--slos)
- [7. Error Budgets & Burn-Rate Policy](#7-error-budgets--burn-rate-policy)
- [8. Grafana Dashboards](#8-grafana-dashboards)
- [9. Alerting Rules, On-Call & Escalation](#9-alerting-rules-on-call--escalation)
- [10. Business Observability (MRR, Churn, Usage)](#10-business-observability-mrr-churn-usage)
- [11. Synthetic Checks](#11-synthetic-checks)
- [12. Performance Optimization Playbook](#12-performance-optimization-playbook)
- [13. Cache-Hit-Rate Targets & Hot-Path Budget](#13-cache-hit-rate-targets--hot-path-budget)
- [14. Failure Handling & Edge Cases](#14-failure-handling--edge-cases)
- [15. Configuration Reference](#15-configuration-reference)
- [16. Related Documents](#16-related-documents)

---

## 1. Observability Architecture & Data Flow

Observability is a **side-effect of the request and job lifecycle**, never a step that can block or fail a response — the same invariant the analytics path follows (see [API Analytics](08-api-analytics.md)). Three signal types leave each process and fan out to three backends; one query/visualization layer (Grafana) stitches them together by `traceId`.

```mermaid
flowchart LR
  subgraph App["Instrumented processes"]
    API["API server (/v1)\nmodular monolith"]
    W["BullMQ workers\n(pincode-sync, webhooks,\nnotifications, rollups)"]
    FE["Next.js surfaces\n(RUM + server)"]
  end

  subgraph SDK["OpenTelemetry SDK (in-process)"]
    M["Metrics\n(OTLP / Prom exporter)"]
    L["Logs\n(JSON → stdout)"]
    T["Traces\n(OTLP spans)"]
  end

  API --> SDK
  W --> SDK
  FE --> SDK

  M -->|scrape /metrics| PROM[("Prometheus\nTSDB 15d")]
  M -->|remote_write| MIMIR[("Mimir / Thanos\nlong-term 13mo")]
  L -->|agent ships| LOKI[("Loki\nlogs 30d")]
  T -->|OTLP gRPC| TEMPO[("Tempo\ntraces 7d")]

  PROM --> ALERT["Alertmanager"]
  PROM --> GRAF["Grafana"]
  MIMIR --> GRAF
  LOKI --> GRAF
  TEMPO --> GRAF
  ALERT --> PD["PagerDuty / Opsgenie\n+ Slack #postpin-alerts"]

  SYN["Synthetic probes\n(Grafana k6 / Blackbox)"] -->|push| PROM
  GRAF --> SLO["SLO + error-budget\ndashboards"]
```

**Stack rationale.** OpenTelemetry (OTel) is the single instrumentation API across Node services so we are never locked to a vendor; the *collector* can re-route to Datadog/New Relic later without code changes. Prometheus is the metrics system of record (pull model, mature alerting); Loki and Tempo are chosen for tight Grafana integration and `traceId`-based pivoting between logs and traces. All three are cheap to self-host on the same cluster as the app (see [Scalability & Capacity Planning](20-scalability.md)).

**Sampling posture.** Metrics and logs are **100% retained** (they are aggregate or already low-volume after structured filtering). Traces are **tail-sampled**: keep 100% of errors, 100% of requests slower than the SLO threshold, and 5% of healthy fast requests. This keeps trace cost bounded while guaranteeing every interesting request is captured.

---

## 2. Pillar 1 — Metrics (Prometheus + OpenTelemetry)

Metrics answer "how much / how fast / how often" cheaply at any time range. Every metric is emitted via the OTel Metrics API and exposed to Prometheus on `GET /metrics` (API server, port 9464) and a per-worker sidecar endpoint.

### 2.1 Naming & label conventions

- Prefix every app metric `postpin_`. Use base units and the Prometheus suffix convention: `_seconds`, `_bytes`, `_total` (counters), `_ratio`.
- **Bound label cardinality ruthlessly.** Never label by `pincode`, `apiKey`, `traceId`, raw `url`, or `tenantId` on high-frequency metrics — that explodes the series count. Use the **normalized route template** (`POST /v1/rates`) and bounded enums (`zone`, `service`, `outcome`). High-cardinality breakdowns belong in logs/analytics, not metrics.
- Reserve a small set of "blessed" labels: `route`, `method`, `status_class` (`2xx`/`4xx`/`5xx`), `outcome` (`success`/`failed`/`blocked`), `zone`, `service`, `cache` (`hit`/`miss`), `env` (`live`/`test`), `worker`.

### 2.2 Core metric catalog

| Metric | Type | Labels | What it measures |
|---|---|---|---|
| `postpin_http_requests_total` | counter | `route, method, status_class, outcome` | Request volume (the "Traffic" golden signal). |
| `postpin_http_request_duration_seconds` | histogram | `route, method, status_class` | End-to-end latency. Buckets below. |
| `postpin_http_errors_total` | counter | `route, error_code` | 5xx + classified engine errors. |
| `postpin_rate_calc_duration_seconds` | histogram | `zone, service, cache` | Pure engine time (excludes auth/queue) — the p99 < 50 ms SLI. |
| `postpin_cache_lookups_total` | counter | `cache_name, result` (`hit`/`miss`) | Drives cache-hit-rate ratios (§13). |
| `postpin_rate_limit_decisions_total` | counter | `decision` (`allow`/`block`) | Rate-limit pressure. |
| `postpin_quota_remaining_ratio` | gauge | `plan` | Min remaining quota fraction per plan (for "near limit" alerts). |
| `postpin_mongo_query_duration_seconds` | histogram | `collection, op` | DB latency by collection/op (`find`,`agg`,`update`). |
| `postpin_redis_command_duration_seconds` | histogram | `command` | Redis latency. |
| `postpin_queue_jobs_total` | counter | `queue, status` (`completed`/`failed`/`retried`) | Job throughput. |
| `postpin_queue_depth` | gauge | `queue, state` (`waiting`/`active`/`delayed`) | Backlog (the USE "saturation" signal for workers). |
| `postpin_queue_job_duration_seconds` | histogram | `queue` | Job processing time. |
| `postpin_pincode_sync_runs_total` | counter | `result` (`success`/`partial`/`failed`) | Nightly India-Post sync outcomes. |
| `postpin_pincode_sync_records` | gauge | `change` (`added`/`updated`/`removed`/`failed`) | Last-sync deltas. |
| `postpin_indiapost_request_duration_seconds` | histogram | `endpoint, status` | Upstream India-Post latency/availability. |
| `postpin_webhook_delivery_total` | counter | `result` (`delivered`/`failed`/`dropped`) | Outbound webhook health. |
| `postpin_active_subscriptions` | gauge | `plan, status` | Billing health (also feeds business board, §10). |
| `postpin_build_info` | gauge=1 | `version, commit, env` | Deploy marker for annotations. |

### 2.3 Histogram buckets

The hot path needs fine resolution near the SLO boundary. Use **explicit bucket boundaries** (OTel `ExplicitBucketHistogram` view) so p99 around 50 ms is precise:

```jsonc
// postpin_rate_calc_duration_seconds (seconds)
[0.001, 0.002, 0.005, 0.010, 0.020, 0.030, 0.040, 0.050, 0.075, 0.100, 0.250, 0.500]
// postpin_http_request_duration_seconds (seconds, wider tail for cold/blocked)
[0.005, 0.010, 0.025, 0.050, 0.080, 0.100, 0.200, 0.300, 0.500, 1, 2, 5]
```

Prefer **native (exponential) histograms** where the Prometheus/Mimir version supports them — they give accurate quantiles at any range without pre-chosen buckets and cut series count.

### 2.4 Node runtime & host metrics

Scrape the standard Node process collectors (`process_cpu_seconds_total`, `nodejs_eventloop_lag_seconds`, `nodejs_heap_size_used_bytes`, `nodejs_gc_duration_seconds`) plus `node_exporter` for host CPU/mem/disk/FD. **Event-loop lag is a first-class API signal** — a lagging loop silently inflates p99 even when Mongo/Redis are fast.

### 2.5 Reference PromQL

```promql
# Request rate by route (req/s)
sum by (route) (rate(postpin_http_requests_total[5m]))

# 5xx error ratio for the rate endpoint
sum(rate(postpin_http_requests_total{route="POST /v1/rates",status_class="5xx"}[5m]))
  / sum(rate(postpin_http_requests_total{route="POST /v1/rates"}[5m]))

# p99 pure engine latency (the SLI)
histogram_quantile(0.99,
  sum by (le) (rate(postpin_rate_calc_duration_seconds_bucket[5m])))

# Cache hit ratio for zone resolution
sum(rate(postpin_cache_lookups_total{cache_name="zone",result="hit"}[5m]))
  / sum(rate(postpin_cache_lookups_total{cache_name="zone"}[5m]))

# Worker saturation: pincode-sync backlog
max(postpin_queue_depth{queue="pincode-sync",state="waiting"})
```

---

## 3. Pillar 2 — Structured Logs & Correlation IDs

Every log line is **one JSON object on one line** to stdout (12-factor); the platform's log agent (Promtail/Alloy) ships it to Loki. We never log secrets, full API keys (log `keyId` + last-4 only), raw request bodies with PII, or full destination addresses.

### 3.1 Canonical log schema

| Field | Type | Notes |
|---|---|---|
| `ts` | ISO-8601 string | UTC, millisecond precision. |
| `level` | enum | `trace\|debug\|info\|warn\|error\|fatal`. Default prod level `info`. |
| `msg` | string | Human-readable, lowercase, no PII. |
| `service` | string | `api`, `worker.pincode-sync`, `worker.webhooks`, etc. |
| `env` | enum | `dev\|staging\|prod`. |
| `version` | string | Build/commit SHA — matches `postpin_build_info`. |
| `traceId` | hex(32) | W3C trace id — **the join key to traces & metrics exemplars**. |
| `spanId` | hex(16) | Active span. |
| `requestId` | string | Per-request UUID; mirrored to client as `X-Request-Id`. |
| `tenantId` | ObjectId | Company scope (null for unauth/blocked). |
| `keyId` | ObjectId | API key id (never the secret). |
| `route` | string | Normalized template. |
| `status` | int | HTTP status. |
| `outcome` | enum | `success\|failed\|blocked`. |
| `errorCode` | string | Stable machine code (e.g. `PINCODE_NOT_SERVICEABLE`, `QUOTA_EXCEEDED`). |
| `latencyMs` | int | End-to-end. |
| `err` | object | `{ name, message, stack, cause }` — only on `warn`+. Stack truncated to 4 kB. |
| `ctx` | object | Bounded, structured extras (e.g. `{ zone, service, cacheHit }`). No free-form blobs. |

### 3.2 Sample log line

```json
{
  "ts": "2026-06-26T18:30:12.481Z",
  "level": "error",
  "msg": "rate calculation failed: delivery pincode not serviceable",
  "service": "api",
  "env": "prod",
  "version": "a1b9f3c",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "requestId": "0f9d2c7a-2c1e-4b8e-9b6e-2f3c4d5e6f70",
  "tenantId": "663f1c2a9d4e8a0012ab34cd",
  "keyId": "663f1c2a9d4e8a0012ab9999",
  "route": "POST /v1/rates",
  "status": 422,
  "outcome": "failed",
  "errorCode": "PINCODE_NOT_SERVICEABLE",
  "latencyMs": 11,
  "ctx": { "originPincode": "560001", "destPincode": "190001", "service": "express" }
}
```

### 3.3 Correlation propagation

```mermaid
sequenceDiagram
  participant C as Client
  participant API as API server
  participant Q as BullMQ
  participant W as Worker
  participant H as Webhook target
  C->>API: POST /v1/rates (traceparent? optional)
  Note over API: extract/generate traceId + requestId
  API-->>C: 200 + X-Request-Id + traceresponse
  API->>Q: enqueue webhook job {traceId, requestId in job data}
  Q->>W: process job
  Note over W: child span continues same traceId
  W->>H: POST webhook (header X-Postpin-Trace: traceId)
```

Rules:
1. Accept inbound W3C `traceparent`/`tracestate`; if absent, **generate** a new `traceId`. Always echo `X-Request-Id` back so customers can quote it in support tickets (see [Support & CRM](11-support-crm.md)).
2. **Persist `traceId`/`requestId` into every BullMQ job's payload** so async work (webhooks, sync, notifications) stays on the same trace.
3. A logger middleware binds `traceId/requestId/tenantId` to an `AsyncLocalStorage` context so child logs auto-inherit them with no manual passing.

### 3.4 Logs ↔ analytics relationship

Operational logs (Loki, 30 d) and the `apiLogs` analytics stream (MongoDB time-series, billing/usage) are **distinct sinks with overlapping fields** — same `requestId`/`traceId`, different retention and audience. Loki is for engineers debugging incidents; `apiLogs` is the customer-facing usage record. Never bill or build customer charts off Loki. See [API Analytics](08-api-analytics.md).

---

## 4. Pillar 3 — Distributed Tracing

A trace is the per-request waterfall across every hop. It is the fastest way to answer "*why was this one call 900 ms?*" — the span tree shows whether time went to Mongo, Redis, a queue wait, or India Post.

### 4.1 Span model for `POST /v1/rates`

```mermaid
gantt
  title Trace: POST /v1/rates (cache miss path)
  dateFormat X
  axisFormat %Lms
  section HTTP
  POST /v1/rates (root)      :a1, 0, 47
  section Gatekeeping
  auth.validateApiKey        :a2, 1, 3
  authz.checkOrigin          :a3, 3, 1
  quota.check (redis)        :a4, 4, 2
  ratelimit.tokenBucket(redis):a5, 6, 1
  section Resolution
  pincode.resolve.origin     :a6, 7, 6
  pincode.resolve.dest       :a7, 13, 6
  zone.resolve (mongo agg)   :a8, 19, 11
  section Calculation
  ratecard.lookup (mongo)    :a9, 30, 9
  surcharges.apply           :a10, 39, 3
  section Async (same trace)
  analytics.emit (async)     :a11, 42, 1
  webhook.enqueue            :a12, 43, 1
```

### 4.2 Span conventions

- **Root span** = the HTTP handler; name it by route template, not URL.
- **Child spans** wrap every out-of-process call (each Mongo query, each Redis command, each India-Post HTTP call, each queue enqueue) — the OTel auto-instrumentations for `http`, `mongodb`, `ioredis`, and `bullmq` produce these for free; add **manual spans** for in-process business stages (`zone.resolve`, `ratecard.lookup`, `surcharges.apply`).
- **Span attributes** (semantic conventions + Postpin extras): `db.system`, `db.mongodb.collection`, `db.operation`, `net.peer.name`, `postpin.tenant_id`, `postpin.zone`, `postpin.service`, `postpin.cache_hit`, `postpin.billable_weight_g`. Mark errors with `span.status = ERROR` and record the `errorCode`.
- **Exemplars:** attach `traceId` exemplars to the latency histograms so a spike in Grafana links straight to a slow trace.

### 4.3 Cross-async tracing

Workers re-attach the propagated context from job data (§3.3) and open a child span (`worker.process <queue>`). The nightly pincode sync produces a long trace: `cron.trigger → indiapost.fetch (N spans) → diff.compute → mongo.bulkWrite → syncLog.write`, so a slow sync is diagnosable hop-by-hop (see [Pincode Management](03-pincode-management.md)).

---

## 5. Golden Signals & the RED/USE Model

We monitor the **four golden signals** for request-driven services (RED = Rate, Errors, Duration) and **USE** (Utilization, Saturation, Errors) for resources (Mongo, Redis, queues, hosts).

| Signal | Definition | Primary metric | Where |
|---|---|---|---|
| **Latency** | Time to serve a request; track success and error latency *separately* (fast 500s hide problems) | `postpin_http_request_duration_seconds`, `postpin_rate_calc_duration_seconds` | API, engine |
| **Traffic** | Demand on the system | `rate(postpin_http_requests_total)` | API |
| **Errors** | Rate of failed requests | `postpin_http_requests_total{status_class="5xx"}`, `postpin_http_errors_total` | API, engine |
| **Saturation** | How "full" a resource is | `nodejs_eventloop_lag_seconds`, `postpin_queue_depth`, Mongo connections in use, Redis memory | runtime, queue, DB |

**Saturation watch-points specific to Postpin:** event-loop lag > 50 ms (Node), Mongo connection-pool checkout wait, Redis `used_memory`/`maxmemory` ratio and eviction rate (evictions on the zone/rate cache directly raise p99), and BullMQ `waiting` depth on `pincode-sync`/`webhooks`.

---

## 6. Per-Module SLIs & SLOs

SLIs are measured ratios; SLOs are the targets over a **30-day rolling window**. "Good" excludes client errors (4xx) the customer caused — a `422 PINCODE_NOT_SERVICEABLE` is a correct answer, not an availability miss.

| Module | SLI (good ÷ valid) | SLO target | Window | Notes |
|---|---|---|---|---|
| **Rate API availability** | non-5xx ÷ all (excl. 429 client-throttle) | **99.95%** | 30 d | The product. ~21.6 min/month budget. |
| **Rate calc latency** | requests with engine time < 50 ms | **p99 < 50 ms** | 30 d (5 m eval) | `postpin_rate_calc_duration_seconds`. |
| **Rate API end-to-end latency** | requests < 200 ms (cold), < 80 ms (warm) | **p95 < 80 ms warm** | 30 d | Includes auth/network. |
| **Pincode sync success** | successful nightly runs ÷ scheduled | **≥ 99%** monthly; **0 silent skips** | 30 d | One failed night is allowed if next succeeds; two consecutive = page. |
| **Pincode data freshness** | runs where `lastSuccessfulSync` < 26 h old | **100%** | rolling | Staleness alert at 26 h (sync is daily 00:30). |
| **Webhook delivery** | delivered (incl. retries within 1 h) ÷ attempted | **99.9%** | 30 d | Beyond retries → dropped + alert. |
| **Dashboard (human) availability** | non-5xx page/API loads | **99.9%** | 30 d | Lower tier than machine path. |
| **Auth/Key validation latency** | key-check < 5 ms | **p99 < 5 ms** | 30 d | Redis-cached key lookups. |
| **Billing job correctness** | invoice/usage rollups completed on time | **100% by 02:00** | daily | Late rollup = warn, missing = page. |
| **India-Post upstream availability** | 2xx ÷ attempts (informational SLI) | track only | — | We don't own it; sync must degrade gracefully. |

**SLI recording rules** are pre-computed in Prometheus so dashboards and burn-rate alerts read a single series:

```yaml
groups:
  - name: postpin-sli
    interval: 30s
    rules:
      - record: sli:rate_api_availability:ratio_rate5m
        expr: |
          sum(rate(postpin_http_requests_total{route="POST /v1/rates",status_class!="5xx"}[5m]))
          / sum(rate(postpin_http_requests_total{route="POST /v1/rates"}[5m]))
      - record: sli:rate_calc:p99_5m
        expr: |
          histogram_quantile(0.99,
            sum by (le) (rate(postpin_rate_calc_duration_seconds_bucket[5m])))
```

---

## 7. Error Budgets & Burn-Rate Policy

A 99.95% availability SLO yields an **error budget of 0.05%** of requests per 30 days (~21.6 minutes of full outage, or proportionally more partial degradation). We govern releases and paging by **multi-window, multi-burn-rate** alerts (Google SRE method) so we page fast on catastrophes and ticket slowly on slow leaks.

| Burn rate | Budget consumed | Long window / short window | Severity | Action |
|---|---|---|---|---|
| **14.4×** | 2% of monthly budget in 1 h | 1 h / 5 m | **Page (P1)** | Wake on-call immediately. |
| **6×** | 5% in 6 h | 6 h / 30 m | **Page (P2)** | Page during business + escalate. |
| **3×** | 10% in 24 h | 24 h / 2 h | **Ticket** | Investigate next business day. |
| **1×** | ~steady drain | 72 h / 6 h | **Ticket** | Trend review. |

```promql
# Fast burn (14.4x): page if both windows are bad
(
  (1 - sli:rate_api_availability:ratio_rate5m)  > (14.4 * 0.0005)
)
and
(
  (1 - sli:rate_api_availability:ratio_rate1h)  > (14.4 * 0.0005)
)
```

**Error-budget policy (enforced, not advisory):**
- Budget **≥ 50% remaining** → ship freely.
- Budget **< 25% remaining** → freeze non-critical feature deploys to the rate path; only reliability fixes ship.
- Budget **exhausted** → full change freeze on the rate path + mandatory blameless postmortem before the next feature release. Reset at the rolling window.

Budget consumption is rendered as a **burn-down gauge** on the SLO dashboard with a projection of "days to exhaustion" at the current rate.

---

## 8. Grafana Dashboards

Dashboards are version-controlled JSON (provisioned via GitOps, not hand-edited in the UI). Each has a `tenant`/`env`/`route` template variable. Deploys are annotated from `postpin_build_info` so regressions line up with releases. UI follows the Postpin design system (Recharts-style panels mirror the customer dashboard in [API Analytics](08-api-analytics.md)).

| Dashboard | Audience | Key panels | Source signals |
|---|---|---|---|
| **Rate API Overview** | On-call, eng | RPS by route; 2xx/4xx/5xx split; p50/p95/p99 (end-to-end + engine); error-budget burn-down; top `errorCode`s; cache-hit ratio | metrics + recording rules |
| **Shipping Engine Deep-Dive** | Eng | Engine p99 vs 50 ms SLO line; latency by `zone`/`service`; cache hit per cache (zone/ratecard/pincode); slab-lookup time; surcharge step timings | metrics + exemplars→traces |
| **Data Tier (USE)** | Eng, DBA | Mongo op latency by collection; slow-query count; connection-pool utilization; Redis ops/s, hit ratio, memory, evictions; replication lag | metrics |
| **Workers & Queues** | Eng | Queue depth (waiting/active/delayed) per queue; job throughput; failure/retry rate; job p95 duration; DLQ size | BullMQ metrics |
| **Pincode Sync** | Eng, Admin | Last run status/time; added/updated/removed/failed; duration trend; India-Post latency & error rate; freshness countdown to 26 h | sync metrics + logs |
| **Webhooks** | Eng | Delivery success %; retry funnel; per-tenant failure heatmap; DLQ; target p95 latency | metrics + logs |
| **SLO / Error Budget** | Leads, on-call | One row per SLO: current SLI, target, 30-d budget remaining, multi-burn-rate status | recording rules |
| **Node Runtime** | Eng | Event-loop lag; heap used vs limit; GC pause; CPU; FD count; restart count | runtime metrics |
| **Synthetics** | On-call | Probe success/latency per region for rate API, dashboard login, docs, sync canary | blackbox/k6 |
| **Business (exec)** | Founders, growth | MRR, new/expansion/churned MRR, active subs by plan, API calls billed, top tenants, near-quota tenants | metrics + Mongo |
| **Logs Explorer** | Eng | Saved Loki queries by `errorCode`/`tenantId`; error-rate-by-route LogQL; pivot-to-trace links | Loki |

**Pivoting is the point:** a latency-histogram exemplar → opens the slow Tempo trace → the span shows the slow Mongo op → "Logs for this span" filters Loki by `traceId`. One spike, three pillars, two clicks.

---

## 9. Alerting Rules, On-Call & Escalation

Alerts fire on **symptoms users feel** (latency, errors, freshness), not raw causes (one node's CPU). Every alert carries a runbook URL, the owning team, and links to the relevant dashboard pre-filtered by `traceId`/route.

### 9.1 Alert catalog

| Alert | Condition (eval over) | Severity | Routes to |
|---|---|---|---|
| `RateApiFastBurn` | budget burn ≥ 14.4× (1 h ∧ 5 m) | P1 page | on-call now |
| `RateApiSlowBurn` | budget burn ≥ 3× (24 h ∧ 2 h) | P3 ticket | eng queue |
| `RateApiHighErrorRate` | 5xx ratio > 2% for 5 m | P1 page | on-call |
| `RateCalcP99Breach` | engine p99 > 50 ms for 10 m | P2 page | on-call |
| `RateApiP95Breach` | e2e p95 > 200 ms for 10 m | P3 ticket | eng |
| `EventLoopLagHigh` | lag > 0.1 s for 5 m | P2 page | on-call |
| `MongoSlowQueries` | slow-query rate > 5/s for 5 m | P3 ticket | DBA |
| `MongoReplicationLag` | lag > 10 s for 5 m | P2 page | DBA/on-call |
| `RedisEvicting` | eviction rate > 0 ∧ hit ratio < 0.9 for 5 m | P2 page | on-call |
| `RedisMemoryHigh` | used/max > 0.85 for 10 m | P3 ticket | eng |
| `QueueBacklogGrowing` | `pincode-sync` waiting > 1 for 15 m, or `webhooks` waiting > 500 for 10 m | P2 page | on-call |
| `WorkerJobFailureSpike` | job failure ratio > 10% for 10 m | P2 page | on-call |
| `PincodeSyncFailed` | last run `result="failed"` | P2 page (P1 if 2 consecutive) | on-call |
| `PincodeDataStale` | `time() - lastSuccessfulSync > 26h` | P1 page | on-call |
| `IndiaPostDegraded` | upstream 5xx ratio > 20% for 10 m | P3 ticket | eng (sync degrades gracefully) |
| `WebhookDeliveryDegraded` | delivery success < 99% for 15 m | P3 ticket | eng |
| `SyntheticRateApiDown` | canary probe failing 3× consecutively | P1 page | on-call |
| `CertExpiringSoon` | TLS expiry < 14 d | P3 ticket | platform |
| `NearQuotaTenantSurge` | count of tenants > 90% quota rising sharply | P4 info | growth (Slack) |

### 9.2 Routing & escalation

```mermaid
flowchart TD
  A[Alert fires] --> B{Severity}
  B -->|P1| C[Page primary on-call\nPagerDuty + Slack]
  B -->|P2| D[Page primary\nbusiness-hours, off-hours best-effort]
  B -->|P3| E[Ticket → eng queue\n+ Slack #postpin-alerts]
  B -->|P4| F[Slack only]
  C --> G{ACK in 5 min?}
  G -->|no| H[Escalate to secondary on-call]
  H --> I{ACK in 5 min?}
  I -->|no| J[Escalate to Eng Lead\n+ notify Founder]
  C --> K[Open incident channel\n#inc-YYYYMMDD-N]
  K --> L[Status page update if customer-facing]
```

**On-call model:** weekly primary + secondary rotation. P1 ACK target 5 min, mitigation target 30 min. Customer-facing incidents (rate API down/degraded) trigger a public status-page update within 15 min. Every P1/P2 gets a **blameless postmortem** within 3 business days; action items are tracked to closure. **Alert hygiene:** any alert paged 3× in 30 days without a real incident is tuned or deleted in the weekly ops review — noisy pages are bugs.

### 9.3 Inhibition & grouping

Alertmanager inhibits downstream noise: if `RateApiHighErrorRate` is firing, suppress dependent `QueueBacklogGrowing` and per-collection Mongo alerts originating from the same incident. Group by `cluster`+`alertname`+`route`; 30 s group wait, 5 m repeat interval for pages.

---

## 10. Business Observability (MRR, Churn, Usage)

Business health is observed on the same stack so growth and reliability share one source of truth. These metrics derive from MongoDB (`subscriptions`, `plans`, `apiLogs`, `companies`) via a scheduled exporter that writes Prometheus gauges and a daily Mongo rollup. See [Subscription & Plan Engine](09-subscription-engine.md).

| Metric | Definition | Source |
|---|---|---|
| **MRR** | Σ normalized monthly value of active subscriptions (annual ÷ 12) | `subscriptions` × `plans` |
| **New MRR** | MRR from subs first activated this period | `subscriptions.activatedAt` |
| **Expansion MRR** | MRR added by upgrades/add-ons on existing subs | plan-change events |
| **Contraction MRR** | MRR lost to downgrades | plan-change events |
| **Churned MRR** | MRR lost to cancellations/expiries | `subscriptions.canceledAt` |
| **Net MRR change** | New + Expansion − Contraction − Churned | derived |
| **Logo churn %** | canceled tenants ÷ active at period start | `companies` |
| **Net revenue retention** | (start MRR + expansion − contraction − churn) ÷ start MRR | derived |
| **ARPA** | MRR ÷ active accounts | derived |
| **API calls billed** | Σ billable `apiLogs` (live env, success+failed, excl. test) | `apiLogs` rollup |
| **Quota utilization** | calls used ÷ plan quota, per tenant | counters + plan |
| **Trial→paid conversion** | converted trials ÷ started trials | `subscriptions` |
| **Activation** | tenants making first successful `/v1/rates` call within 7 d of signup | `apiLogs` + `companies` |

Exporter sketch (Prometheus gauges):

```promql
postpin_mrr_inr{plan="growth"}            42000
postpin_mrr_change_inr{kind="expansion"}   8500
postpin_logo_churn_ratio                   0.018
postpin_net_revenue_retention_ratio        1.07
postpin_api_calls_billed_total{env="live"} 1.93e7
```

These power the **Business (exec) dashboard** (§8) and feed slow-burn alerts (`NetRevenueRetentionDrop` info-level to the growth Slack). Business metrics are **lower-frequency** (hourly/daily scrape) and clearly separated from operational metrics so a billing exporter hiccup never noises up on-call.

---

## 11. Synthetic Checks

Synthetics catch problems **before customers do** by probing from outside, on a fixed cadence, with deterministic inputs. We run Grafana Cloud Synthetic / k6 probes plus Blackbox Exporter, from at least two regions (in-India PoP + one external).

### 11.1 Rate API canary

A dedicated **test-env API key** with a fixed, well-known origin/destination so the expected quote is deterministic and assertable.

```json
// k6 / synthetic check: POST /v1/rates
{
  "method": "POST",
  "url": "https://api.postpin.dev/v1/rates",
  "headers": { "Authorization": "Bearer pk_test_synthetic_canary" },
  "body": {
    "originPincode": "560001",
    "destPincode": "110001",
    "weightGrams": 1000,
    "dimensionsCm": { "l": 20, "w": 15, "h": 10 },
    "paymentType": "prepaid",
    "service": "surface"
  },
  "assertions": [
    { "type": "status", "equals": 200 },
    { "type": "responseTimeMs", "lessThan": 250 },
    { "type": "jsonpath", "path": "$.zone", "equals": "national" },
    { "type": "jsonpath", "path": "$.currency", "equals": "INR" },
    { "type": "jsonpath", "path": "$.total", "greaterThan": 0 },
    { "type": "jsonpath", "path": "$.breakdown.gst", "exists": true }
  ],
  "frequency": "60s",
  "regions": ["in-mumbai", "ap-singapore"]
}
```

A **canary correctness assertion** (exact `total` for the fixed input, recomputed from a pinned rate card) catches *silent calculation regressions* that a 200-only check would miss — a wrong-but-fast quote is worse than an outage. If the canary's expected total must change (legitimate rate-card edit), the assertion value is updated via the same GitOps change.

### 11.2 Other synthetic probes

| Probe | Cadence | Asserts |
|---|---|---|
| Rate API canary (above) | 60 s | 200, latency, zone, correctness |
| Auth failure path | 5 m | bad key → 401 `invalid_api_key`; over-quota test key → 402/429 |
| Dashboard login flow | 5 m | login page 200, auth → redirect, session cookie set |
| Docs portal | 10 m | docs home 200, OpenAPI spec reachable |
| Webhook round-trip | 15 m | platform → receiver echo within 5 s |
| **India-Post sync canary** | hourly | probe `api.postalpincode.in` for a known pincode (e.g. `110001`), assert shape/2xx; alerts `IndiaPostDegraded` early so we know *before* 00:30 |
| Sync freshness check | 30 m | `lastSuccessfulSync` < 26 h (also a metric alert; synthetic gives external confirmation) |

### 11.3 Sync deep-check

Beyond the upstream probe, a daily post-sync synthetic queries `GET /admin/pincodes/sync/last` and asserts the run was `success`, `failed == 0` (or within tolerance), and `added/updated/removed` are within historical bounds (e.g. a sudden 90% "removed" likely means an upstream format change, not real deletions — **block auto-apply and page**, consistent with the rollback safeguards in [Pincode Management](03-pincode-management.md)).

---

## 12. Performance Optimization Playbook

Performance is a feature with a budget (p99 engine < 50 ms). Optimization is **measure → find the bottleneck → fix → verify with the same metric**, never speculative.

### 12.1 Profiling workflow

```mermaid
flowchart LR
  A[SLO breach or\nlatency regression] --> B[Open Grafana:\nwhich route/zone/op?]
  B --> C[Exemplar → slow trace\nin Tempo]
  C --> D{Time spent where?}
  D -->|Mongo span| E[explain plan,\nindex check]
  D -->|Redis span| F[cache miss / big value /\nN round-trips]
  D -->|CPU/in-process| G[Node --prof /\nclinic flame / 0x]
  D -->|Event-loop lag| H[sync work on hot path?\noffload to worker]
  E & F & G & H --> I[Fix + add/adjust\nbenchmark]
  I --> J[Verify same metric\nimproved; annotate deploy]
```

Tools: OTel traces for *where*; `node --prof` / `clinic.js` (flame, bubbleprof, doctor) / `0x` for CPU flamegraphs; Mongo `explain("executionStats")` and `$indexStats`; `redis-cli --latency` and `SLOWLOG`; autocannon/k6 for load.

### 12.2 MongoDB query optimization

| Issue | Detection | Fix |
|---|---|---|
| Collection scan (`COLLSCAN`) | `explain` stage, `MongoSlowQueries` alert | Add index matching query predicate + sort (ESR rule: Equality, Sort, Range). |
| Unbounded result | large `nReturned` | Always paginate; cap `limit`; project only needed fields. |
| Slow zone resolution | engine span > budget | Compound index on `(originZone, destZone, service)`; serve from Redis first (§13). |
| Rate-card lookup scan | trace span on `rateCards` | Index `(tenantId, status, effectiveFrom)`; cache resolved card per tenant. |
| Hot pincode lookups | repeated `find` on `pincodes` | Index `pincode` (unique); Redis-cache resolved pincode→zone. |
| Analytics aggregation slow | rollup job p95 | Time-series collection + bucketed pre-aggregation (see [API Analytics](08-api-analytics.md)); never aggregate raw on read. |

**Index governance:** every new query ships with a justified index; review `$indexStats` quarterly and drop unused indexes (they slow writes and the nightly sync's bulk upserts). Keep working set in RAM; alert on page faults.

### 12.3 N+1 avoidance

The classic N+1 — resolving a list and then querying per item — is forbidden on any hot or batch path:

| Path | N+1 trap | Fix |
|---|---|---|
| `POST /v1/rates/bulk` (many shipments) | per-shipment pincode/zone/rate-card query | **Batch-resolve**: one `$in` query for all pincodes; load the tenant's rate card once; compute in memory. |
| Dashboard usage table | per-row tenant/plan lookup | `$lookup` or a single batched fetch keyed by id-set; never query in a render loop. |
| Webhook fan-out | per-event subscriber query | Cache active webhook subscriptions per tenant in Redis. |
| Pincode sync diff | per-record `findOne` then update | Load existing set in bulk, diff in memory, `bulkWrite` upserts/deletes. |

Detection: a trace with **many sibling spans on the same collection** is an N+1 fingerprint; the Engine dashboard flags requests with `mongo_query_count > 5`.

### 12.4 Other hot-path rules

- **No synchronous third-party calls** on the rate path (India Post is touched only by the nightly sync worker).
- **No synchronous writes** on the rate path — analytics, counters, and webhooks are fire-and-forget to BullMQ.
- **Compute, don't fetch** where cheap (volumetric weight is arithmetic; never a DB round-trip).
- **Connection pooling** sized to load; reuse Mongo/Redis clients (no per-request connect).
- **Payload discipline:** gzip/br responses; project minimal fields; the rate response is small and bounded.
- **Avoid event-loop blocking:** no large synchronous JSON/`crypto` work in the request handler; offload CPU-heavy batch jobs to workers.

---

## 13. Cache-Hit-Rate Targets & Hot-Path Budget

Redis-first reads are what keep the engine under 50 ms. Each cache has an explicit hit-rate target; missing it is an alertable regression because misses fall through to Mongo and blow the latency budget.

| Cache | Key shape | TTL / invalidation | Hit-rate target |
|---|---|---|---|
| **Pincode → zone-meta** | `pin:{pincode}` | 24 h; busted on sync change for that pincode | **≥ 98%** (small, stable, hot set) |
| **Zone resolution** | `zone:{origin}:{dest}:{service}` | 6 h; busted on zone-rule edit | **≥ 95%** |
| **Rate card (resolved)** | `rc:{tenantId}:{version}` | until card version bumps | **≥ 99%** (rarely changes) |
| **API key meta** | `key:{hash}` | 5 m; busted on key revoke/rotate | **≥ 99%** |
| **Quota counters** | `quota:{tenantId}:{cycle}` | cycle TTL | N/A (always read) |

**Targeted invalidation, never blanket flush:** a sync that changes 1,200 pincodes deletes exactly those `pin:*` keys and the affected `zone:*` keys; it never `FLUSHDB`. The rate-card builder bumps a version in the key on edit so the old entry is naturally abandoned (no race). Cache **stampede protection**: on miss, use a short per-key lock / single-flight so a hot key recompute doesn't fan out to N parallel Mongo queries.

Hot-path latency budget (cache-hit path), summing to the 50 ms engine SLO with headroom:

| Stage | Budget (ms) |
|---|---|
| Auth + origin + quota + rate-limit (Redis) | ≤ 6 |
| Pincode resolve ×2 (Redis hit) | ≤ 4 |
| Zone resolve (Redis hit) | ≤ 3 |
| Rate-card + slab lookup (Redis hit) | ≤ 4 |
| Surcharge stack (in-memory arithmetic) | ≤ 3 |
| Serialization + overhead | ≤ 5 |
| **Engine total (target p99)** | **≤ 50** |

See [Shipping Engine](04-shipping-engine.md) for the per-stage algorithms behind these budgets.

---

## 14. Failure Handling & Edge Cases

| Scenario | Risk | Handling |
|---|---|---|
| **Telemetry backend down** (Prometheus/Loki/Tempo) | App tries to ship, stalls | Exporters are non-blocking, bounded buffers, drop-oldest; **observability failure must never raise request latency or a 5xx**. Emit a local `otel_export_failures_total` and alert separately. |
| **OTel collector overload** | Memory pressure | Collector has memory-limiter + queue with backpressure; tail-sampler drops healthy traces first. |
| **Cardinality explosion** | Prometheus OOM | Hard allowlist of labels in code review; `target_limit`/`label_limit` on scrape; CI lint that rejects high-cardinality labels. |
| **Clock skew** | Wrong latency / trace ordering | NTP on all hosts; latency measured with monotonic clock, timestamps in UTC. |
| **Missing `traceId` on async job** | Broken trace correlation | Propagation is enforced at enqueue; a job without context starts a new root and logs `warn orphan_trace`. |
| **Synthetic canary false-positive** (rate-card legitimately changed) | Noisy page | Canary expected-total is GitOps-pinned to the rate-card version; a card edit updates both in one PR. |
| **India-Post upstream down at 00:30** | Sync fails | `IndiaPostDegraded` warns from the hourly probe *before* the run; sync retries with backoff, marks `partial/failed`, **keeps existing data** (never wipes), pages only on 2 consecutive failures or 26 h staleness. |
| **Mass "removed" from upstream format change** | Catastrophic false deletes | Deep-check tolerance gate blocks auto-apply, snapshots for rollback, pages (see [Pincode Management](03-pincode-management.md)). |
| **Log PII leak** | Compliance breach | Redaction middleware strips known PII fields; CI test asserts no API-key secret/full-address pattern in log output. |
| **Alert storm during major incident** | On-call overwhelmed | Inhibition rules + grouping + a single incident channel; symptom alerts page, cause alerts inhibited. |
| **Exemplar trace expired** (7 d retention) | Dead link from old graph | Acceptable; metrics retain 13 mo, traces are for live debugging only. |
| **Multi-tenant noisy neighbor** | One tenant's spike degrades others | Per-tenant rate limits + a `top tenants by RPS` panel; alert on single-tenant share > threshold. |

---

## 15. Configuration Reference

All observability behavior is configurable via env/Super-Admin settings (the `settings` collection) so thresholds can be tuned without redeploys where safe.

```jsonc
{
  "observability": {
    "metrics": {
      "enabled": true,
      "port": 9464,
      "path": "/metrics",
      "histogram": "native",          // "native" | "explicit"
      "defaultLabels": ["env", "version"]
    },
    "logs": {
      "level": "info",                // trace|debug|info|warn|error|fatal
      "format": "json",
      "redactFields": ["authorization", "apiKey", "address", "phone", "email"],
      "sampleDebugRatio": 0.0
    },
    "traces": {
      "enabled": true,
      "exporter": "otlp",
      "endpoint": "http://otel-collector:4317",
      "tailSampling": {
        "keepErrors": true,
        "keepSlowerThanMs": 50,
        "healthyRatio": 0.05
      }
    },
    "slo": {
      "rateApiAvailability": 0.9995,
      "rateCalcP99Ms": 50,
      "rateApiP95WarmMs": 80,
      "syncSuccessRate": 0.99,
      "freshnessHours": 26,
      "webhookDelivery": 0.999
    },
    "errorBudget": {
      "windowDays": 30,
      "freezeBelowRemaining": 0.25,
      "burnRates": { "fast": 14.4, "med": 6, "slow": 3 }
    },
    "alerting": {
      "pagerProvider": "pagerduty",   // pagerduty | opsgenie
      "slackChannel": "#postpin-alerts",
      "ackTimeoutMin": 5,
      "repeatIntervalMin": 5
    },
    "synthetics": {
      "rateApiCanary": {
        "enabled": true,
        "frequencySec": 60,
        "regions": ["in-mumbai", "ap-singapore"],
        "assertCorrectness": true
      },
      "indiaPostCanaryEnabled": true,
      "freshnessProbeMin": 30
    },
    "cacheTargets": {
      "pincodeZone": 0.98,
      "zoneResolution": 0.95,
      "rateCard": 0.99,
      "apiKeyMeta": 0.99
    },
    "retention": {
      "metricsDays": 15,
      "metricsLongTermMonths": 13,
      "logsDays": 30,
      "tracesDays": 7
    }
  }
}
```

---

## 16. Related Documents

- [System Architecture](01-architecture.md) — the components and request pipeline being observed.
- [Pincode Management](03-pincode-management.md) — sync internals, rollback safeguards, freshness.
- [Shipping Charges Engine](04-shipping-engine.md) — the 50 ms hot path and per-stage budgets.
- [Zone Management](05-zone-management.md) — zone resolution cached on the hot path.
- [Rate Card Builder](06-rate-card-builder.md) — rate-card versioning and cache invalidation.
- [API Key & Access Management](07-api-management.md) — auth/quota/rate-limit gates and key metrics.
- [API Analytics & Usage Intelligence](08-api-analytics.md) — the `apiLogs` stream and customer-facing usage (distinct from operational logs).
- [Subscription & Plan Engine](09-subscription-engine.md) — source data for MRR/churn business metrics.
- [Support System & CRM](11-support-crm.md) — `requestId` quoting from customers in tickets.
- [Audit Logging](12-audit-logs.md) — security/audit trail (complementary to operational logs).
- [Notification Center](13-notification-center.md) — alert → email/webhook notification delivery.
- [Scalability & Capacity Planning](20-scalability.md) — capacity, autoscaling, and load shedding informed by these signals.
- [Backup & Disaster Recovery](22-backup-dr.md) — RPO/RTO targets validated by synthetic restores and monitored here.
