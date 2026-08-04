# 📙 BOOK 3 — API Specification

| Field | Value |
|---|---|
| Project Name | JobAtlas |
| Document Type | API Specification |
| Version | 1.0 |
| Status | Draft |
| Base URL (public) | `https://api.jobatlas.io/api/v1` |
| Base URL (internal) | `https://internal.jobatlas.io/api/v1` |
| Depends On | Book 1 (Ch. 14, 26, 29), Book 2 (schema) |

---

## Table of Contents

1. Introduction & Conventions
2. Authentication & Authorization
3. Global Error Format & Status Codes
4. Rate Limiting
5. Pagination, Filtering & Sorting Conventions
6. Public API — Authentication Endpoints
7. Public API — Jobs Endpoints
8. Public API — Search Endpoints
9. Public API — Companies Endpoints
10. Public API — Filters/Metadata Endpoints
11. Public API — Bookmarks Endpoints
12. Public API — Job Alerts Endpoints
13. Public API — Resume & AI Endpoints
14. Admin API
15. Internal API — Job Processor API
16. Webhook API
17. API Versioning & Deprecation
18. Full Error Catalog
19. Postman/OpenAPI Notes
20. Checklists & Acceptance Criteria

---

## Chapter 1 — Introduction & Conventions

### 1.1 Purpose
This document specifies every REST endpoint in JobAtlas: request shape, response shape, authentication requirements, error conditions, and worked examples. It implements the services defined in Book 1, Chapter 14, over the schema defined in Book 2.

### 1.2 Conventions
- All request/response bodies are JSON (`Content-Type: application/json`), except file uploads (`multipart/form-data`).
- All fields use `camelCase` (Book 1, Ch. 28.2), even though the underlying database uses `snake_case` — the API layer is responsible for the mapping.
- All timestamps are ISO-8601 UTC strings (e.g., `2026-08-02T10:00:00Z`).
- All endpoints are versioned under `/api/v1` (Book 1, Ch. 29).
- All list endpoints are paginated (Chapter 5).
- All monetary values are returned as numbers with an accompanying `currency` (ISO 4217) field — never assume USD.

### 1.3 Service-to-Endpoint Map

| Service (Book 1 Ch. 14) | Endpoint Groups |
|---|---|
| Authentication Service | Chapter 6 |
| Job Service | Chapter 7 |
| Search Service | Chapter 8 |
| Company Service | Chapter 9 |
| — (metadata) | Chapter 10 |
| User Service | Chapter 11, 12, 13 |
| Admin Service | Chapter 14 |
| Job Processor API | Chapter 15 |
| Alert Service | Chapter 16 (dispatch triggers webhook) |

---

## Chapter 2 — Authentication & Authorization

### 2.1 Scheme
JWT bearer tokens (Book 1, Ch. 16). Two token types:

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access Token | 15 minutes | Memory / short-lived cookie | Sent on every authenticated request |
| Refresh Token | 30 days | HttpOnly secure cookie | Used only against `/auth/refresh` |

### 2.2 Header Format
```
Authorization: Bearer <accessToken>
```

### 2.3 Role Enforcement
Every endpoint below declares a required role from Book 1, Chapter 6 (`visitor`, `user`, `admin`, `system`). Enforcement happens at the API layer via middleware — **never** solely in the frontend. A request with insufficient role receives `403 FORBIDDEN` (Chapter 3).

### 2.4 Internal/System Authentication
The internal Job Processor API (Chapter 15) is not reachable from the public internet. It authenticates n8n → API traffic via a static service credential (`X-Service-Key` header) validated against a secret store, distinct from user JWTs.

---

## Chapter 3 — Global Error Format & Status Codes

All errors follow the contract defined in Book 1, Chapter 26.3:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Field 'title' is required",
    "requestId": "b3f1c2b0-...",
    "timestamp": "2026-08-02T10:00:00Z"
  }
}
```

### 3.1 HTTP Status Code Usage

| Code | Meaning | Used For |
|---|---|---|
| 200 | OK | Successful GET/PUT/PATCH |
| 201 | Created | Successful POST creating a resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Malformed request body/params |
| 401 | Unauthorized | Missing/invalid/expired token |
| 403 | Forbidden | Valid token, insufficient role |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource (e.g., email already registered) |
| 422 | Unprocessable Entity | Semantically invalid (e.g., salaryMin > salaryMax) |
| 429 | Too Many Requests | Rate limit exceeded (Chapter 4) |
| 500 | Internal Server Error | Unhandled server fault |
| 503 | Service Unavailable | Dependency (DB/search) down |

Full per-endpoint error codes are cataloged in Chapter 18.

---

## Chapter 4 — Rate Limiting

| Client Type | Limit |
|---|---|
| Unauthenticated | 60 requests / minute / IP |
| Authenticated user | 300 requests / minute / user |
| Admin | 600 requests / minute |
| Internal (Job Processor API) | Not rate-limited (trusted network) |

Rate-limit headers returned on every response:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1785660000
```
Exceeding the limit returns `429` with `error.code = "RATE_LIMIT_EXCEEDED"` and a `Retry-After` header.

---

## Chapter 5 — Pagination, Filtering & Sorting Conventions

### 5.1 Pagination (cursor-based for `jobs`, offset-based elsewhere)
```
GET /jobs?limit=20&cursor=eyJpZCI6...
```
Response envelope:
```json
{
  "data": [ ],
  "pagination": {
    "limit": 20,
    "nextCursor": "eyJpZCI6...",
    "hasMore": true
  }
}
```
Cursor pagination is used specifically for `/jobs` and `/search` because offset pagination degrades on large, frequently-changing result sets. Smaller, stable resource lists (e.g., `/bookmarks`) use simple offset pagination: `?limit=20&offset=40`.

### 5.2 Filtering
Query parameters map directly to filterable fields, e.g. `?country=US&remote=true&salaryMin=80000&employmentType=full_time`.

### 5.3 Sorting
`?sort=postedAt:desc` (default) or `?sort=salaryMax:desc`, `?sort=relevance:desc` (search only).

---

## Chapter 6 — Public API: Authentication Endpoints

### 6.1 `POST /auth/register`
**Auth:** none · **Role:** visitor → creates `user`

Request:
```json
{ "email": "jane@example.com", "password": "S3cure!Pass", "fullName": "Jane Doe" }
```
Response `201`:
```json
{ "id": "uuid", "email": "jane@example.com", "fullName": "Jane Doe", "createdAt": "..." }
```
Errors: `409 EMAIL_ALREADY_EXISTS`, `422 WEAK_PASSWORD`, `400 VALIDATION_ERROR`

### 6.2 `POST /auth/login`
**Auth:** none

Request: `{ "email": "jane@example.com", "password": "S3cure!Pass" }`
Response `200`:
```json
{ "accessToken": "jwt...", "expiresIn": 900, "user": { "id": "uuid", "email": "...", "role": "user" } }
```
(Refresh token set as HttpOnly cookie.)
Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED`

### 6.3 `POST /auth/refresh`
**Auth:** refresh cookie required
Response `200`: `{ "accessToken": "jwt...", "expiresIn": 900 }`
Errors: `401 REFRESH_TOKEN_INVALID`

### 6.4 `POST /auth/logout`
**Auth:** user
Response `204`. Revokes the current session row (Book 2, `sessions.revoked_at`).

### 6.5 `GET /auth/oauth/{provider}` and `GET /auth/oauth/{provider}/callback`
**Auth:** none · `provider` ∈ `{google, github}`
Standard OAuth2 authorization-code redirect flow; callback issues tokens identical to 6.2.

---

## Chapter 7 — Public API: Jobs Endpoints

### 7.1 `GET /jobs`
**Auth:** none (visitor) · **Role:** visitor+

Query params: `country, city, remote, employmentType, salaryMin, salaryMax, category, companyId, sort, limit, cursor`

Response `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Senior Backend Engineer",
      "company": { "id": "uuid", "name": "Acme Inc", "logoUrl": "..." },
      "location": { "country": "US", "city": "Remote", "isRemote": true },
      "employmentType": "full_time",
      "salary": { "min": 140000, "max": 180000, "currency": "USD" },
      "postedAt": "2026-07-30T00:00:00Z",
      "applyUrl": "https://..."
    }
  ],
  "pagination": { "limit": 20, "nextCursor": "...", "hasMore": true }
}
```

### 7.2 `GET /jobs/{id}`
**Auth:** none
Response `200`: full job object including `descriptionHtml`, `skills[]`, `status`.
Errors: `404 JOB_NOT_FOUND`

### 7.3 `GET /jobs/{id}/similar`
**Auth:** none
Returns up to 10 related jobs (same category/company/skills). Response shape identical to 7.1's `data[]`.

---

## Chapter 8 — Public API: Search Endpoints

### 8.1 `GET /search`
**Auth:** none

Query params: `q` (free text), plus all filters from 7.1, plus `mode` ∈ `{keyword, semantic}` (semantic requires AI Engine, Book 6).

Response `200`: same envelope as 7.1, plus `meta.tookMs` and `meta.totalEstimate`.

Example:
```
GET /search?q=react%20developer&remote=true&salaryMin=70000&mode=semantic
```

### 8.2 `GET /search/suggestions`
**Auth:** none
Query: `?q=reac`
Response: `{ "suggestions": ["react developer", "react native", "reactor engineer"] }` — typeahead, backed by Meilisearch.

---

## Chapter 9 — Public API: Companies Endpoints

### 9.1 `GET /companies`
**Auth:** none · Query: `?search=&industry=&limit=&offset=`

### 9.2 `GET /companies/{id}`
**Auth:** none
Response: company profile + `activeJobCount`.
Errors: `404 COMPANY_NOT_FOUND`

### 9.3 `GET /companies/{id}/jobs`
**Auth:** none
Same response shape as 7.1, scoped to one company.

---

## Chapter 10 — Public API: Filters/Metadata Endpoints

### 10.1 `GET /filters`
**Auth:** none
Returns available filter facets and current counts, used to populate the search UI dynamically:
```json
{
  "countries": [{ "code": "US", "count": 120345 }],
  "employmentTypes": [{ "value": "full_time", "count": 98213 }],
  "categories": [{ "slug": "engineering", "count": 45012 }]
}
```

### 10.2 `GET /categories` / `GET /skills`
**Auth:** none — simple reference-data listing endpoints for building filter UIs and tagging.

---

## Chapter 11 — Public API: Bookmarks Endpoints

### 11.1 `GET /bookmarks`
**Auth:** user
Response: paginated list of saved jobs (full job objects, shape as 7.1).

### 11.2 `POST /bookmarks`
**Auth:** user
Request: `{ "jobId": "uuid" }` → `201`
Errors: `404 JOB_NOT_FOUND`, `409 ALREADY_BOOKMARKED`

### 11.3 `DELETE /bookmarks/{jobId}`
**Auth:** user → `204`

---

## Chapter 12 — Public API: Job Alerts Endpoints

### 12.1 `GET /alerts`
**Auth:** user — list the user's alerts.

### 12.2 `POST /alerts`
**Auth:** user
Request:
```json
{
  "name": "Remote React Jobs",
  "keywords": "react",
  "country": "US",
  "isRemoteOnly": true,
  "salaryMin": 90000,
  "frequency": "daily"
}
```
Response `201`: created alert object.
Errors: `422 INVALID_FREQUENCY`, `400 VALIDATION_ERROR`

### 12.3 `PATCH /alerts/{id}`
**Auth:** user (must own the alert) → `200`
Errors: `403 NOT_ALERT_OWNER`, `404 ALERT_NOT_FOUND`

### 12.4 `DELETE /alerts/{id}`
**Auth:** user (owner) → `204`

---

## Chapter 13 — Public API: Resume & AI Endpoints

### 13.1 `POST /resume`
**Auth:** user · `multipart/form-data`, field `file` (PDF/DOCX, max 5MB)
Response `202` (async processing):
```json
{ "resumeId": "uuid", "status": "processing" }
```
Errors: `422 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`

### 13.2 `GET /resume/{id}`
**Auth:** user (owner)
Response: parsed profile once `status: "ready"` (`parsedSkills`, `parsedExperience`, `parsedTitles`).

### 13.3 `GET /recommendations`
**Auth:** user
Requires at least one processed resume. Response: ranked job list with `matchScore` per job (Book 2, `job_matches`).
Errors: `422 NO_RESUME_ON_FILE`

---

## Chapter 14 — Admin API

All endpoints under `/admin/*` require **Role: admin**. All admin write actions are recorded to `audit_logs` (Book 2, Ch. 10.4; Book 1, Ch. 16).

### 14.1 `GET /admin/sources`
List all sources with health: `lastSyncedAt`, `isActive`, `last7dSuccessRate` (from `sync_logs`).

### 14.2 `POST /admin/sources/{id}/trigger-sync`
Manually triggers an n8n workflow run via n8n's webhook trigger. Response `202`.

### 14.3 `PATCH /admin/sources/{id}`
Update `isActive`, `syncIntervalMinutes`.

### 14.4 `GET /admin/workflow-logs`
Query: `?sourceId=&status=&from=&to=&limit=`

### 14.5 `GET /admin/stats`
Platform-wide KPIs (Book 1 Ch. 3): total active jobs, daily update volume, duplicate rate, failed-ingestion rate.

### 14.6 `GET /admin/users` / `PATCH /admin/users/{id}` (suspend/reactivate) / `DELETE /admin/users/{id}`

### 14.7 `GET /admin/analytics/search`
Top queries, zero-result-rate, from `search_history`.

---

## Chapter 15 — Internal API: Job Processor API

**Not exposed publicly.** Reachable only from the internal network (n8n container network). Implements the pipeline from Book 1, Chapters 9 and 11.

### 15.1 `POST /internal/jobs`
**Auth:** `X-Service-Key` header (Chapter 2.4)

Request (envelope format from Book 1, Ch. 10.2):
```json
{
  "source": "greenhouse",
  "fetchedAt": "2026-08-02T10:00:00Z",
  "raw": { }
}
```

Response `200`:
```json
{
  "jobId": "uuid",
  "action": "created" ,
  "fingerprintHash": "..."
}
```
`action` ∈ `{created, updated, rejected}`. On `rejected`, response includes `reason` and `validationErrors[]`; the record is logged, not stored (Book 1 Ch. 26.2).

Errors: `401 INVALID_SERVICE_KEY`, `422 NORMALIZATION_FAILED`

### 15.2 `POST /internal/jobs/batch`
Same as 15.1 but accepts an array, for connectors that fetch in bulk (e.g., Greenhouse's per-company job list). Response includes per-item results.

### 15.3 `POST /internal/jobs/expire-check`
Triggered by the Maintenance workflow (Book 4). Body: `{ "olderThanDays": 30 }`. Executes the expiry update from Book 2, Chapter 19 sample query.

---

## Chapter 16 — Webhook API

### 16.1 Outbound: Alert Notifications
When the Alert Service (Book 1 Ch. 14) finds new matches for an active alert, it does not call an external webhook directly — it enqueues a notification consumed by the n8n Notifications workflow (Book 4), which sends email. This keeps delivery mechanics out of the core API.

### 16.2 Inbound: Future Developer Webhooks (Stage 4, Book 1 Ch. 2.2)
Reserved endpoint, not implemented in v1:
`POST /webhooks/subscriptions` — allow third-party developers to register a callback URL for `job.created` events matching a filter. Full spec deferred until the Developer Platform stage.

---

## Chapter 17 — API Versioning & Deprecation

(Implements Book 1, Chapter 29)

- Current version: `v1`. All paths in this document are implicitly prefixed `/api/v1`.
- Breaking changes ship as `/api/v2` with both versions live for the deprecation window.
- Deprecated endpoints return:
```
Deprecation: true
Sunset: Wed, 01 Feb 2027 00:00:00 GMT
Link: <https://docs.jobatlas.io/migration/v2>; rel="deprecation"
```

---

## Chapter 18 — Full Error Catalog

| Code | HTTP Status | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Request body/params failed schema validation |
| EMAIL_ALREADY_EXISTS | 409 | Registration with existing email |
| WEAK_PASSWORD | 422 | Password doesn't meet policy |
| INVALID_CREDENTIALS | 401 | Login failed |
| ACCOUNT_SUSPENDED | 403 | Admin-suspended account |
| REFRESH_TOKEN_INVALID | 401 | Expired/revoked/missing refresh token |
| JOB_NOT_FOUND | 404 | Job ID doesn't exist |
| COMPANY_NOT_FOUND | 404 | Company ID doesn't exist |
| ALREADY_BOOKMARKED | 409 | Duplicate bookmark |
| ALERT_NOT_FOUND | 404 | Alert ID doesn't exist |
| NOT_ALERT_OWNER | 403 | User doesn't own the alert |
| INVALID_FREQUENCY | 422 | Alert frequency not in allowed set |
| UNSUPPORTED_FILE_TYPE | 422 | Resume upload not PDF/DOCX |
| FILE_TOO_LARGE | 413 | Resume exceeds 5MB |
| NO_RESUME_ON_FILE | 422 | Recommendations requested with no processed resume |
| INVALID_SERVICE_KEY | 401 | Internal API auth failed |
| NORMALIZATION_FAILED | 422 | Job Processor could not normalize raw payload |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unhandled exception |
| SERVICE_UNAVAILABLE | 503 | Downstream dependency (DB/search) unreachable |

---

## Chapter 19 — OpenAPI / Postman Notes

- This document is the human-readable source of truth; an `openapi.yaml` SHOULD be generated/maintained alongside it for tooling (Swagger UI, client SDK generation, contract testing).
- Recommended: define request/response schemas in OpenAPI 3.1 using `components/schemas` mirroring the objects in Chapters 6–16, and validate the actual API against the spec in CI (contract testing) to prevent drift.

---

## Chapter 20 — Checklists & Acceptance Criteria

### 20.1 Completeness Checklist
- [ ] Every service in Book 1 Ch. 14 has a corresponding endpoint group
- [ ] Every endpoint declares required role/auth
- [ ] Every endpoint lists at least its primary error cases
- [ ] Every field name is `camelCase` and traceable to a Book 2 column
- [ ] Pagination/filtering/sorting conventions are consistent across all list endpoints

### 20.2 Acceptance Criteria for "Book 3 Complete"
- [ ] A backend engineer or AI coding agent can implement all controllers directly from this document without further clarification
- [ ] Error codes in Chapter 18 cover every error referenced in Chapters 6–16
- [ ] Internal API (Chapter 15) is clearly separated from public API and cannot be reached without the service key

---

## Document Status & Next Steps

This completes **Book 3 — API Specification, v1.0**. It defines the full contract layer between the Frontend (Book 5), the n8n Automation Layer (Book 4, via the Internal API in Chapter 15), and the AI Engine (Book 6, via Chapter 13).

**Feeds directly into:**
- **Book 4 — n8n Workflow Documentation**, whose every connector workflow terminates in a call to `POST /internal/jobs` (Chapter 15.1) exactly as specified here.
- **Book 5 — Frontend Documentation**, which will consume Chapters 6–13 exclusively.

**Status: ✅ Book 3 Complete — Ready to proceed to Book 4 (n8n Workflow Documentation).**
