# 📕 BOOK 4 — n8n Workflow Documentation

| Field | Value |
|---|---|
| Project Name | JobAtlas |
| Document Type | n8n Workflow Specification |
| Version | 1.0 |
| Status | Draft |
| Automation Engine | n8n (self-hosted) |
| Depends On | Book 1 (Ch. 10, 21.1), Book 2 (schema), Book 3 (Ch. 15 — Internal API) |

---

## Table of Contents

1. Introduction & Design Rules
2. Folder Structure
3. Scheduling Strategy
4. Shared Conventions (Error Handling, Retry, Logging)
5. Workflow 1 — Greenhouse Collector
6. Workflow 2 — Lever Collector
7. Workflow 3 — Ashby Collector
8. Workflow 4 — Workday Collector
9. Workflow 5 — Government Jobs Collector
10. Workflow 6 — Company Website Crawler
11. Workflow 7 — Normalization (internal, inside Job Processor API)
12. Workflow 8 — Duplicate Detection (internal, inside Job Processor API)
13. Workflow 9 — Store Jobs (internal, inside Job Processor API)
14. Workflow 10 — Cleanup
15. Workflow 11 — Health Check
16. Workflow 12 — Retry Failed Jobs
17. Workflow 13 — Job Alerts (Matching)
18. Workflow 14 — Notifications (Dispatch)
19. Workflow 15 — Resume Processing
20. Workflow 16 — AI Matching
21. Credentials & Secrets Management
22. Checklists & Acceptance Criteria

---

## Chapter 1 — Introduction & Design Rules

### 1.1 Purpose
This document specifies every n8n workflow in JobAtlas at implementation detail: trigger, node-by-node logic, error handling, retry behavior, performance notes, and example input/output. It implements the Job Collection Engine and Job Processing Engine defined in Book 1 (Ch. 10–11) and calls the Internal API defined in Book 3 (Ch. 15).

### 1.2 Hard Rules (from Book 1, Ch. 10.2 and Ch. 9.1)
1. **One workflow per source.** Never combine sources.
2. **Collector workflows never write to PostgreSQL or the search index directly.** They only fetch and POST to the Job Processor API (Book 3, Ch. 15).
3. **A failure in one workflow MUST NOT affect any other workflow.** No shared execution state between source workflows beyond the common Job Processor API endpoint.
4. **Normalization, deduplication, and storage logic live only in the Job Processor API** (Chapters 11–13 below describe this logic as implemented server-side, not as n8n nodes, to avoid the exact duplication problem Book 1 Ch. 9.1 warns against). n8n orchestrates *when* processing happens (via Maintenance/retry workflows) but never re-implements *how*.

---

## Chapter 2 — Folder Structure

```
Jobs/
    Greenhouse/
        Fetch Companies
        Fetch Jobs
        Update Jobs
    Lever/
        Fetch Companies
        Fetch Jobs
    Ashby/
        Fetch Jobs
    Workday/
        Fetch Jobs
    Government/
        Fetch Jobs
    CompanyWebsites/
        Crawl Jobs
    Processor/
        (Reference only — actual logic lives in the Job Processor API, Book 3 Ch.15;
         this subfolder holds the internal test/replay workflow used for debugging)
        Replay Failed Payload
    Notifications/
        Job Alerts
        Email Alerts
    Maintenance/
        Cleanup
        Health Check
        Expired Jobs
        Retry Failed Jobs
    AI/
        Resume Processing
        AI Matching
```

This mirrors and extends the structure proposed in the original planning discussion, folded into the same responsibility-per-folder principle used throughout Book 1.

---

## Chapter 3 — Scheduling Strategy

| Source / Workflow | Cadence | Rationale |
|---|---|---|
| Greenhouse | Every 15 minutes | High-signal ATS, frequent postings (Book 1 Ch. 3 KPI: 100K+ daily updates) |
| Lever | Every 15 minutes | Same as above |
| Ashby | Every 15 minutes | Same as above |
| Workday | Every 60 minutes | Heavier, slower API; lower update frequency observed |
| Government feeds | Every 60 minutes | Moderate churn |
| Company websites | Every 6–24 hours | Low churn, higher scraping risk — polite cadence (Book 1 Ch. 32 compliance) |
| Cleanup | Daily, 02:00 UTC | Off-peak |
| Health Check | Every 5 minutes | Fast failure detection (Book 1 Ch. 3 KPI: <30 min detection) |
| Retry Failed Jobs | Every 30 minutes | Balances recovery speed vs. load |
| Job Alerts (instant) | Event-triggered, on new job stored | Real-time alert tier |
| Job Alerts (daily/weekly) | 08:00 UTC daily / Monday 08:00 UTC weekly | Digest tiers |

---

## Chapter 4 — Shared Conventions

### 4.1 Error Handling (implements Book 1, Ch. 26)

Every collector workflow uses the same error-handling skeleton:

```
[Trigger] → [Fetch] → [Error Trigger branch]
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Transient error      Fatal error
           (timeout, 5xx, 429)   (schema unrecognized)
                    │                   │
             Retry (n8n's built-in    Log to workflow_logs
             retry-on-fail, backoff)  status='failed',
                    │                   error_message set;
             Max 5 attempts            Alert Admin (Ch.15
                    │                   Health Check picks
             Still failing → Log       this up)
             + Alert, continue to
             next company/page
```

### 4.2 Retry Logic
- Node-level retry: n8n's native "Retry On Fail" with `maxTries: 5`, exponential backoff starting at 30s.
- Workflow-level retry: handled separately by the **Retry Failed Jobs** workflow (Chapter 16), which re-drives specifically the batch that failed rather than re-running the entire source sync.

### 4.3 Logging
Every workflow's final node (success or failure path) writes one row to `workflow_logs` (Book 2, Ch. 10.1) via a lightweight internal logging call, and — for source-sync workflows specifically — one row to `sync_logs` (Book 2, Ch. 10.2) summarizing created/updated/expired/rejected counts.

### 4.4 Performance Baseline

| Workflow type | Expected runtime | Notes |
|---|---|---|
| ATS API collector (single run) | 30s–3min | Depends on number of companies configured |
| Company website crawler | 2–10min | Sequential, rate-limited to be polite |
| Cleanup | <5min | Simple UPDATE against indexed columns |
| Health Check | <10s | Lightweight status query |

---

## Chapter 5 — Workflow 1: Greenhouse Collector

**Path:** `Jobs/Greenhouse/Fetch Jobs`
**Trigger:** Cron, every 15 minutes (Chapter 3)

### 5.1 Nodes
1. **Cron** — `*/15 * * * *`
2. **Read Company List** — Postgres node, `SELECT external_ref FROM companies WHERE source='greenhouse' AND is_active=true` (company list maintained via `Fetch Companies` sub-workflow, run daily)
3. **Loop Over Companies** — SplitInBatches (batch size 5, to avoid rate-limit bursts)
4. **HTTP Request** — `GET https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true`
5. **Set Envelope** — wraps response: `{ source: "greenhouse", fetchedAt: now(), raw: <response> }`
6. **HTTP Request → Internal API** — `POST /internal/jobs/batch` (Book 3, Ch. 15.2) with `X-Service-Key` header
7. **IF (response contains rejections)** → log to `workflow_logs`
8. **Write sync_logs summary**

### 5.2 Error Handling
- HTTP 429 from Greenhouse → retry with backoff (4.2); if still failing after 5 attempts, skip that company for this cycle, log, continue loop.
- HTTP 404 (company board removed/renamed) → mark company `is_active=false` after 3 consecutive 404s, alert admin.
- Internal API 4xx (validation) → logged per Book 3 Ch. 15.1's `rejected` action; does not halt the loop.

### 5.3 Example Input (raw Greenhouse response, abbreviated)
```json
{
  "jobs": [
    {
      "id": 4827193,
      "title": "Senior Backend Engineer",
      "location": { "name": "Remote - US" },
      "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/4827193",
      "updated_at": "2026-07-30T10:00:00Z",
      "content": "<p>We are looking for...</p>"
    }
  ]
}
```

### 5.4 Example Output (envelope sent to Internal API)
```json
{
  "source": "greenhouse",
  "fetchedAt": "2026-08-02T10:15:00Z",
  "raw": {
    "externalId": "4827193",
    "title": "Senior Backend Engineer",
    "location": "Remote - US",
    "applyUrl": "https://job-boards.greenhouse.io/acme/jobs/4827193",
    "updatedAt": "2026-07-30T10:00:00Z",
    "descriptionHtml": "<p>We are looking for...</p>"
  }
}
```

### 5.5 Sub-workflow: `Fetch Companies`
**Trigger:** Daily, 03:00 UTC. Pulls a maintained list of Greenhouse board tokens (from a config table or curated list) and upserts into `companies`/`sources` mapping. Kept separate per Book 1 Ch. 10.2 (one responsibility per workflow).

---

## Chapter 6 — Workflow 2: Lever Collector

**Path:** `Jobs/Lever/Fetch Jobs`
**Trigger:** Cron, every 15 minutes

Structurally identical to Chapter 5 — same node skeleton, only the HTTP endpoint and response-parsing `Set` node differ:

- **HTTP Request** — `GET https://api.lever.co/v0/postings/{company}?mode=json`
- Field mapping differs: Lever's `hostedUrl` → `applyUrl`, `categories.location` → `location`, `descriptionPlain` → `description`.

All error handling, retry, logging, and Internal API integration are identical to Chapter 5 (Book 1 Ch. 10.2: "Exactly the same. Only the API endpoint changes.").

### 6.1 Example Input (raw Lever posting, abbreviated)
```json
{
  "id": "a1b2c3-lever-id",
  "text": "Product Designer",
  "categories": { "location": "Berlin, Germany", "commitment": "Full-time" },
  "hostedUrl": "https://jobs.lever.co/acme/a1b2c3",
  "descriptionPlain": "About the role..."
}
```

---

## Chapter 7 — Workflow 3: Ashby Collector

**Path:** `Jobs/Ashby/Fetch Jobs`
**Trigger:** Cron, every 15 minutes
Same skeleton as Chapters 5–6. Endpoint: `GET https://api.ashbyhq.com/posting-api/job-board/{company}`. Ashby returns `jobUrl`, `location`, `employmentType` natively closer to the Unified Job Schema, requiring the lightest mapping of the three ATS connectors.

---

## Chapter 8 — Workflow 4: Workday Collector

**Path:** `Jobs/Workday/Fetch Jobs`
**Trigger:** Cron, every 60 minutes (Chapter 3 — heavier API, lower cadence)

### 8.1 Differences from ATS connectors above
- Workday's API is tenant-specific and often requires POST-based search requests rather than simple GET, and paginated responses (`limit`/`offset`).
- **Extra node:** "Paginate" (loop until `total` reached), inserted between HTTP Request and Set Envelope.
- Rate limits are stricter; batch size reduced to 2 concurrent tenant requests.

Error handling, Internal API integration, and logging follow Chapter 4's shared conventions unchanged.

---

## Chapter 9 — Workflow 5: Government Jobs Collector

**Path:** `Jobs/Government/Fetch Jobs`
**Trigger:** Cron, every 60 minutes

### 9.1 Notes
- Government job feeds vary by jurisdiction (e.g., USAJobs API, EU public portals). Each jurisdiction is configured as a distinct "company-equivalent" entry in the source config, reusing the same workflow with parameterized endpoints via the Loop node — jurisdictions are data, not separate workflows, since they share one consistent request/response contract per feed provider.
- If a government API requires an API key (e.g., USAJobs), the key is stored in n8n credentials (Chapter 21) and injected via the HTTP Request node's authentication config, never hardcoded.

---

## Chapter 10 — Workflow 6: Company Website Crawler

**Path:** `Jobs/CompanyWebsites/Crawl Jobs`
**Trigger:** Cron, every 6–24 hours (per-company configurable, Chapter 3)

### 10.1 Nodes
1. **Cron**
2. **Read Company URL List** — companies without ATS API coverage
3. **Loop Over Companies**
4. **HTTP Request** — download HTML
5. **HTML Extract (schema.org JobPosting)** — parse `<script type="application/ld+json">` blocks for `JobPosting` schema
6. **IF (JobPosting schema found)** → Set Envelope → Internal API
   **ELSE** → log "no structured data found", skip (no fallback scraping of unstructured HTML, to reduce fragility and respect Book 1 Ch. 32 compliance posture)
7. Standard logging/error nodes (Chapter 4)

### 10.2 Compliance Note
Per Book 1, Chapter 32: this workflow MUST check `robots.txt` before crawling a new company domain (automated check node run once when a company is added, result cached), and MUST NOT be added for domains that disallow automated access.

---

## Chapter 11 — Workflow 7: Normalization (Internal API Logic)

**Location:** Implemented inside the Job Processor API (Book 3, Ch. 15.1), not as a standalone n8n workflow — documented here for completeness of the pipeline narrative (Book 1, Ch. 9).

### 11.1 Logic
1. Receive envelope (`source`, `fetchedAt`, `raw`).
2. Apply source-specific field mapping (Chapters 5–10's "Example Output" sections show the target shape) into the Unified Job Schema (Book 1 Ch. 9 / Book 2 `jobs` table columns).
3. Coerce types: parse salary strings to `NUMERIC`, map free-text location to `country_id`/`city_id` via lookup (fuzzy match against `cities`, fallback to `location_raw` only).
4. Validate required fields (`title`, `company`, `applyUrl`, `description`) — reject with `NORMALIZATION_FAILED` if missing (Book 3 Ch. 18).

---

## Chapter 12 — Workflow 8: Duplicate Detection (Internal API Logic)

**Location:** Job Processor API (Book 3, Ch. 15.1).

### 12.1 Logic
1. Compute `fingerprint_hash = SHA256(company + '|' + title + '|' + location + '|' + applyUrl)` (Book 1 Ch. 11, Book 2 Ch. 4.1).
2. `INSERT ... ON CONFLICT (fingerprint_hash) DO UPDATE SET last_seen_at = now()` (Book 2, Ch. 15.5 — batch upsert pattern).
3. Return `action: created | updated` based on `xmax = 0` check.

---

## Chapter 13 — Workflow 9: Store Jobs (Internal API Logic)

**Location:** Job Processor API (Book 3, Ch. 15.1).

### 13.1 Logic
1. Persist the upserted row (Chapter 12).
2. Write a `job_updates` row (Book 2, Ch. 4.3) reflecting `created`/`refreshed`/`field_changed`.
3. Upsert the corresponding document into the search index (Meilisearch) synchronously (Book 1, Ch. 12.3).
4. If `action = created`, evaluate active **instant-frequency** job alerts against this job (triggers Workflow 13, Chapter 17, via an internal event rather than polling).

---

## Chapter 14 — Workflow 10: Cleanup

**Path:** `Maintenance/Cleanup`
**Trigger:** Daily, 02:00 UTC

### 14.1 Nodes
1. **Cron**
2. **HTTP Request → Internal API** — `POST /internal/jobs/expire-check` (Book 3, Ch. 15.3), body `{ "olderThanDays": 30 }`
3. **Postgres** — archive/delete jobs `status='expired'` older than 12 months (Book 1 Ch. 30 retention) into a cold-storage table or export
4. **Postgres** — drop/rotate old partitions on `api_logs`, `job_updates`, `search_history`, `workflow_logs` (Book 2, Ch. 14) beyond retention window
5. **Log summary to workflow_logs**

### 14.2 Error Handling
Non-fatal by design — if archival fails, log and alert, but never block the ingestion pipeline (Cleanup is fully decoupled from Collection/Processing).

---

## Chapter 15 — Workflow 11: Health Check

**Path:** `Maintenance/Health Check`
**Trigger:** Every 5 minutes (Chapter 3 — meets Book 1 Ch. 3 KPI of <30min detection)

### 15.1 Nodes
1. **Cron**
2. **Postgres Query** — pull `sources` where `last_synced_at < now() - (2 × sync_interval_minutes)` (i.e., missed at least one expected cycle)
3. **Postgres Query** — pull recent `sync_logs` success rate per source (last 7 days, Book 2 Ch. 19 sample query)
4. **IF (source overdue OR success rate < 90%)** → **Notify Admin** (email/Slack via credential-configured node)
5. **Write health snapshot** for the Admin dashboard's `GET /admin/sources` (Book 3, Ch. 14.1) to consume

### 15.2 Example Output (admin alert payload)
```json
{
  "alert": "SOURCE_UNHEALTHY",
  "source": "workday",
  "lastSyncedAt": "2026-08-02T07:00:00Z",
  "successRate7d": 0.72,
  "threshold": 0.90
}
```

---

## Chapter 16 — Workflow 12: Retry Failed Jobs

**Path:** `Maintenance/Retry Failed Jobs`
**Trigger:** Every 30 minutes (Chapter 3)

### 16.1 Nodes
1. **Cron**
2. **Postgres Query** — `SELECT * FROM workflow_logs WHERE status='failed' AND created_at > now() - interval '24 hours' AND retry_count < 3`
3. **Loop Over Failures**
4. **Switch (by source)** → re-invoke the specific source's collector sub-flow scoped to only the failed batch (not a full re-sync)
5. **Increment retry_count**, update `workflow_logs`

### 16.2 Design Rationale
This workflow exists specifically so that a transient failure (Book 1 Ch. 26.2) doesn't require waiting for the next full 15-minute cycle, while also not re-fetching the entire source unnecessarily.

---

## Chapter 17 — Workflow 13: Job Alerts (Matching)

**Path:** `Notifications/Job Alerts`
**Trigger:** Two modes:
- **Instant:** internal event from Workflow 9 (Chapter 13.1, step 4) via n8n Webhook trigger node
- **Digest (daily/weekly):** Cron, 08:00 UTC daily / Monday 08:00 UTC weekly

### 17.1 Nodes (digest mode)
1. **Cron**
2. **Postgres Query** — active alerts matching `frequency` for this run
3. **Loop Over Alerts**
4. **Postgres Query** — jobs matching alert criteria posted since `last_sent_at` (Book 2, Ch. 19 sample query)
5. **IF (matches > 0)** → **Set Notification Payload** → hand off to Workflow 14 (Chapter 18)
6. **Update `last_sent_at`**

### 17.2 Instant Mode
Steps 3–6 collapse to a single alert lookup scoped to the one newly created job, evaluated against all `frequency='instant'` active alerts whose filters match.

---

## Chapter 18 — Workflow 14: Notifications (Dispatch)

**Path:** `Notifications/Email Alerts`
**Trigger:** Called by Workflow 13 (internal sub-workflow invocation)

### 18.1 Nodes
1. **Execute Workflow Trigger** (receives payload: user, matched jobs)
2. **Render Email Template** (Set/HTML node — subject + body listing matched jobs)
3. **Send Email** (SMTP or transactional email provider node, credential-configured)
4. **Log delivery** to a notification log (extension of `workflow_logs`)

### 18.2 Error Handling
Email delivery failure → retry twice (Chapter 4.2 pattern), then log and skip — never blocks the alert-matching workflow itself, which has already committed `last_sent_at`.

---

## Chapter 19 — Workflow 15: Resume Processing

**Path:** `AI/Resume Processing`
**Trigger:** Webhook, called by Backend API on `POST /resume` (Book 3, Ch. 13.1) after the file is stored

### 19.1 Nodes
1. **Webhook Trigger** — receives `{ resumeId, fileUrl }`
2. **HTTP Request** — fetch file from storage
3. **AI Node (LLM call)** — extract skills/experience/titles (full prompt spec in Book 6)
4. **Postgres** — update `resume_profiles.parsed_*` fields, set status
5. **HTTP Request → Internal API or direct trigger** — kick off Workflow 16 (AI Matching) for this resume

### 19.2 Error Handling
Parse failure (malformed PDF, unsupported layout) → mark `resume_profiles.status = 'failed'`, surface via `GET /resume/{id}` (Book 3 Ch. 13.2) rather than silently retrying indefinitely — user-facing failure, not a transient infra issue.

---

## Chapter 20 — Workflow 16: AI Matching

**Path:** `AI/AI Matching`
**Trigger:** Called by Workflow 15 on resume-ready, and re-run nightly for all active resumes against newly added jobs

### 20.1 Nodes
1. **Trigger** (webhook or cron, dual-mode)
2. **Postgres Query** — candidate jobs (active, category-filtered pre-selection to bound the AI workload)
3. **AI Node** — compute match scores (embeddings similarity or LLM scoring, per Book 6)
4. **Postgres** — upsert `job_matches` rows (Book 2, Ch. 9)

Full algorithmic detail (embedding model choice, scoring formula, prompt templates) is specified in Book 6 (AI Documentation) — this workflow only defines the orchestration shell.

---

## Chapter 21 — Credentials & Secrets Management

- All third-party API keys (government feed keys, email provider, etc.) are stored in **n8n's built-in credential store**, never in workflow JSON or plain environment variables inside nodes.
- The Internal API service key (`X-Service-Key`, Book 3 Ch. 2.4) is stored as an n8n credential and referenced by every collector workflow's final HTTP Request node.
- Credentials are scoped per-folder where n8n supports it, so a compromised Greenhouse credential cannot be used to call the Lever API path, etc.
- Rotation policy: service keys rotated quarterly; rotation is a two-step process (issue new key, update n8n credential, revoke old key) to avoid downtime.

---

## Chapter 22 — Checklists & Acceptance Criteria

### 22.1 Per-Workflow Completeness Checklist
- [ ] Trigger type and cadence documented
- [ ] Node-by-node flow documented
- [ ] Error handling path documented (transient vs. fatal, per Book 1 Ch. 26.2)
- [ ] Retry behavior documented
- [ ] Logging target (`workflow_logs`/`sync_logs`) documented
- [ ] Example input and output provided

### 22.2 Acceptance Criteria for "Book 4 Complete"
- [ ] Every source in Book 1 Ch. 10.3 has a corresponding workflow chapter
- [ ] No workflow writes directly to PostgreSQL or the search index except via the Internal API (Book 3 Ch. 15) — verified against Chapter 1.2 Rule 2
- [ ] All scheduling matches the cadence table in Chapter 3, consistent with Book 1 Ch. 18/21
- [ ] Folder structure (Chapter 2) matches what's implemented in the n8n instance

---

## Document Status & Next Steps

This completes **Book 4 — n8n Workflow Documentation, v1.0**. It fully specifies the automation layer that feeds the pipeline defined in Book 1 (Ch. 9), through the Internal API contract defined in Book 3 (Ch. 15), into the schema defined in Book 2.

**Feeds directly into:**
- **Book 5 — Frontend Documentation**, which consumes the Public API (Book 3, Ch. 6–13) — the frontend never interacts with n8n directly.
- **Book 6 — AI Documentation**, which will expand Chapters 19–20 (Resume Processing, AI Matching) with full model/prompt/embedding detail.
- **Book 7 — Deployment & Scaling**, which will define how the n8n instance itself is containerized, monitored, and scaled (Book 1 Ch. 18, Phase 2: "multiple ingestion workers").

**Status: ✅ Book 4 Complete — Ready to proceed to Book 5 (Frontend Documentation).**
