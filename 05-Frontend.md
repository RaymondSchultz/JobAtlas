# 📒 BOOK 5 — Frontend Documentation

| Field | Value |
|---|---|
| Project Name | JobAtlas |
| Document Type | Frontend UI/UX Specification |
| Version | 1.0 |
| Status | Draft |
| Framework | Next.js (React) |
| Depends On | Book 1 (Ch. 15), Book 3 (Public API, Ch. 6–13) |

---

## Table of Contents

1. Introduction & Architectural Rules
2. Tech Stack & Project Structure
3. Design System — Color Palette
4. Design System — Typography
5. Design System — Spacing, Radius, Elevation
6. Component Library
7. Page 1 — Homepage
8. Page 2 — Search
9. Page 3 — Job Detail
10. Page 4 — Company Profile
11. Page 5 — Saved Jobs
12. Page 6 — Job Alerts
13. Page 7 — Resume Upload
14. Page 8 — User Dashboard
15. Page 9 — Authentication (Login/Register)
16. Page 10 — Admin Dashboard
17. Responsive Design Strategy
18. State Management & Data Fetching
19. Accessibility Standards
20. SEO Strategy
21. Error & Empty States
22. Checklists & Acceptance Criteria

---

## Chapter 1 — Introduction & Architectural Rules

### 1.1 Purpose
This document specifies every page, component, and design-system rule for the JobAtlas web application. It implements Book 1, Chapter 15 ("Frontend") and consumes exclusively the Public API defined in Book 3, Chapters 6–13.

### 1.2 Architectural Rules (from Book 1, Ch. 15.2)
1. The frontend MUST remain stateless with respect to business logic — no deduplication, matching, eligibility, or permission logic client-side beyond what's needed for optimistic UI.
2. All data comes from the Public API (Book 3). The frontend never queries PostgreSQL, Meilisearch, or n8n directly.
3. Role-based UI hiding (e.g., hiding the Admin link from non-admins) is a UX convenience only — the API enforces authorization independently (Book 3, Ch. 2.3). The frontend must never rely on hidden UI as a security boundary.
4. Server-side rendering (SSR) is used for SEO-critical pages (Homepage, Search, Job Detail, Company Profile); client-side rendering is acceptable for authenticated-only pages (Dashboard, Saved Jobs, Alerts).

---

## Chapter 2 — Tech Stack & Project Structure

| Concern | Choice |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS |
| State/Data | React Query (server state) + minimal Zustand/Context (client-only UI state) |
| Forms | React Hook Form + Zod validation (mirrors Book 3 request schemas) |
| Icons | Lucide |

```
frontend/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                  # Homepage
│   │   ├── search/page.tsx
│   │   ├── jobs/[id]/page.tsx
│   │   ├── companies/[id]/page.tsx
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (authenticated)/
│   │   ├── dashboard/page.tsx
│   │   ├── saved-jobs/page.tsx
│   │   ├── alerts/page.tsx
│   │   └── resume/page.tsx
│   └── (admin)/
│       └── admin/page.tsx
├── components/
│   ├── ui/            # design-system primitives
│   ├── jobs/
│   ├── search/
│   └── layout/
├── lib/
│   ├── api-client.ts  # typed wrapper over Book 3 endpoints
│   └── hooks/
└── styles/
```

---

## Chapter 3 — Design System: Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | #1E3A8A (deep blue) | Primary actions, links, brand |
| `--color-primary-hover` | #1E40AF | Hover state |
| `--color-accent` | #059669 (green) | Success, "Apply" CTA, remote badge |
| `--color-warning` | #D97706 | Alerts, expiring soon |
| `--color-danger` | #DC2626 | Errors, destructive actions |
| `--color-bg` | #FFFFFF | Page background |
| `--color-bg-subtle` | #F8FAFC | Card/section background |
| `--color-border` | #E2E8F0 | Dividers, card borders |
| `--color-text-primary` | #0F172A | Headings, body text |
| `--color-text-secondary` | #64748B | Metadata, captions |

Dark mode tokens are defined as a parallel `--color-*-dark` set, toggled via a `data-theme` attribute; full dark-mode palette is a Phase 2 addition (not required for v1 launch).

---

## Chapter 4 — Design System: Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Display (Homepage hero) | Inter | 48px / 3rem | 700 |
| H1 (page title) | Inter | 32px / 2rem | 700 |
| H2 (section title) | Inter | 24px / 1.5rem | 600 |
| H3 (card title, job title) | Inter | 18px / 1.125rem | 600 |
| Body | Inter | 16px / 1rem | 400 |
| Small / Caption | Inter | 14px / 0.875rem | 400 |
| Micro (badges, tags) | Inter | 12px / 0.75rem | 500 |

Line height: 1.5 for body text, 1.2 for headings. Monospace (`JetBrains Mono`) reserved for salary figures and code-like data only if needed — not used broadly.

---

## Chapter 5 — Design System: Spacing, Radius, Elevation

| Token | Value |
|---|---|
| `--space-1` … `--space-8` | 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px (4px base scale) |
| `--radius-sm` | 6px (inputs, badges) |
| `--radius-md` | 10px (cards) |
| `--radius-lg` | 16px (modals) |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.08)` |
| `--shadow-modal` | `0 10px 30px rgba(0,0,0,0.15)` |

---

## Chapter 6 — Component Library

| Component | Used On | Notes |
|---|---|---|
| `JobCard` | Search, Homepage, Company, Saved Jobs | Title, company logo, location, salary badge, remote badge, posted-date, save button |
| `SearchBar` | Homepage, Search | Autocomplete via `GET /search/suggestions` (Book 3 Ch. 8.2) |
| `FilterPanel` | Search | Country, remote, salary range slider, employment type, category — sourced from `GET /filters` (Book 3 Ch. 10.1) |
| `CompanyBadge` | JobCard, Job Detail | Logo + name, links to Company Profile |
| `SalaryBadge` | JobCard, Job Detail | Formats `salary.min`–`salary.max` `currency` |
| `RemoteBadge` | JobCard | Green pill, shown when `isRemote: true` |
| `Pagination` / `InfiniteScroll` | Search, Job listings | Cursor-based, matches Book 3 Ch. 5.1 |
| `AlertForm` | Job Alerts page | Maps 1:1 to `POST /alerts` schema (Book 3 Ch. 12.2) |
| `ResumeDropzone` | Resume Upload | Drag/drop, calls `POST /resume` (Book 3 Ch. 13.1), shows async processing status |
| `MatchScoreBadge` | Recommendations | Renders `matchScore` from `GET /recommendations` (Book 3 Ch. 13.3) |
| `Toast` | Global | Success/error feedback for all mutations |
| `EmptyState` | All list views | See Chapter 21 |
| `Skeleton` | All async views | Loading placeholder matching final layout shape |

---

## Chapter 7 — Page 1: Homepage

**Route:** `/` · **Rendering:** SSR

### 7.1 Sections
1. Hero — headline, `SearchBar`, trust indicator ("5M+ active jobs")
2. Popular categories (from `GET /categories`, Book 3 Ch. 10.2)
3. Featured/recent remote jobs — `GET /jobs?remote=true&sort=postedAt:desc&limit=6`
4. "How it works" explainer (static content)
5. Footer with links to Companies, About, API docs (Stage 4 placeholder)

### 7.2 Primary CTA
Search bar submit → navigates to `/search?q=...`.

---

## Chapter 8 — Page 2: Search

**Route:** `/search` · **Rendering:** SSR for initial load, client-side refetch on filter change

### 8.1 Layout
Two-column: `FilterPanel` (left, collapsible on mobile) + results list (right).

### 8.2 Data Flow
- Initial load: SSR call to `GET /search` (Book 3 Ch. 8.1) using URL query params directly as filters — the URL is the single source of truth for search state (shareable/bookmarkable searches).
- Filter change → update URL (shallow routing) → React Query refetch.
- Infinite scroll using `pagination.nextCursor`.

### 8.3 States
Loading (`Skeleton` × 6), empty (`EmptyState`: "No jobs match your filters" + "Clear filters" action), error (retry action), populated.

---

## Chapter 9 — Page 3: Job Detail

**Route:** `/jobs/[id]` · **Rendering:** SSR (SEO-critical, Book 1 Ch. 15's stateless rule + Ch. 20 SEO strategy)

### 9.1 Sections
1. Title, `CompanyBadge`, `SalaryBadge`, `RemoteBadge`, posted date
2. Full description (`descriptionHtml`, sanitized before render)
3. Skills tags (`skills[]`)
4. Sticky "Apply" button → external `applyUrl` (opens new tab; JobAtlas never intercepts the application flow — Book 1 Ch. 32.2)
5. Save button (bookmark toggle, `POST`/`DELETE /bookmarks`, Book 3 Ch. 11)
6. "Similar Jobs" section — `GET /jobs/{id}/similar` (Book 3 Ch. 7.3)
7. Company mini-profile card linking to `/companies/[id]`

### 9.2 Data Fetching
`GET /jobs/{id}` (Book 3 Ch. 7.2). 404 → dedicated "This job may have expired" page with link back to Search, not a generic 404.

---

## Chapter 10 — Page 4: Company Profile

**Route:** `/companies/[id]` · **Rendering:** SSR

### 10.1 Sections
1. Company header — logo, name, industry, size, HQ
2. Active job count
3. Job list — `GET /companies/{id}/jobs` (Book 3 Ch. 9.3), paginated

---

## Chapter 11 — Page 5: Saved Jobs

**Route:** `/saved-jobs` · **Auth required** · **Rendering:** CSR

`GET /bookmarks` (Book 3 Ch. 11.1) rendered as a `JobCard` grid. Empty state: "You haven't saved any jobs yet" + CTA to Search. Each card's save button toggles to `DELETE /bookmarks/{jobId}` with optimistic removal from the list.

---

## Chapter 12 — Page 6: Job Alerts

**Route:** `/alerts` · **Auth required** · **Rendering:** CSR

### 12.1 Layout
List of existing alerts (`GET /alerts`) each showing name, criteria summary, frequency, active toggle, edit/delete actions. "Create Alert" opens `AlertForm` (modal), submitting to `POST /alerts` (Book 3 Ch. 12.2). Edits go to `PATCH /alerts/{id}` (Ch. 12.3).

### 12.2 Validation
Client-side Zod schema mirrors Book 3's request shape exactly, so validation errors surface before submission; server-side `422`/`400` errors (Book 3 Ch. 18) still handled and displayed as a fallback.

---

## Chapter 13 — Page 7: Resume Upload

**Route:** `/resume` · **Auth required** · **Rendering:** CSR

### 13.1 Flow
1. `ResumeDropzone` → `POST /resume` (multipart, Book 3 Ch. 13.1) → `202 processing`
2. Poll `GET /resume/{id}` (Ch. 13.2) every 3s until `status: ready` or `failed`
3. On `ready` → show parsed skills/experience summary + link to `/dashboard` recommendations
4. On `failed` → show error + re-upload CTA (no silent retry, per Book 4 Ch. 19.2)

---

## Chapter 14 — Page 8: User Dashboard

**Route:** `/dashboard` · **Auth required** · **Rendering:** CSR

### 14.1 Sections
1. Recommendations — `GET /recommendations` (Book 3 Ch. 13.3), each `JobCard` annotated with `MatchScoreBadge`
2. Quick links: Saved Jobs, Alerts, Resume status
3. Account summary (email, member since)

If no resume on file (`422 NO_RESUME_ON_FILE`), show a prompt card linking to Resume Upload instead of the recommendation list.

---

## Chapter 15 — Page 9: Authentication

**Routes:** `/login`, `/register` · **Rendering:** CSR

### 15.1 Login
Email/password form → `POST /auth/login` (Book 3 Ch. 6.2). OAuth buttons (Google/GitHub) → `GET /auth/oauth/{provider}` redirect flow (Ch. 6.5). Access token held in memory (React Query/Zustand), refresh token cookie is HttpOnly and never touched by JS directly.

### 15.2 Register
Form → `POST /auth/register` (Ch. 6.1) → auto-login on success. Password strength meter client-side, mirrored by server validation (`422 WEAK_PASSWORD`).

### 15.3 Session Handling
Axios/fetch interceptor: on `401`, attempt silent `POST /auth/refresh` (Ch. 6.3) once; on repeat failure, clear session and redirect to `/login`.

---

## Chapter 16 — Page 10: Admin Dashboard

**Route:** `/admin` · **Role: admin required** (enforced server-side per Chapter 1.2 Rule 3) · **Rendering:** CSR

### 16.1 Sections
1. Source health table — `GET /admin/sources` (Book 3 Ch. 14.1), with manual "Trigger Sync" button (`POST /admin/sources/{id}/trigger-sync`, Ch. 14.2)
2. Platform stats — `GET /admin/stats` (Ch. 14.5), matching Book 1 Ch. 3 KPIs visually (jobs, daily updates, dup rate, failure rate)
3. Workflow logs table — filterable, `GET /admin/workflow-logs` (Ch. 14.4)
4. User management table — `GET/PATCH/DELETE /admin/users` (Ch. 14.6)
5. Search analytics — top queries, zero-result rate (Ch. 14.7)

---

## Chapter 17 — Responsive Design Strategy

| Breakpoint | Width | Layout Change |
|---|---|---|
| `sm` | ≥640px | Base mobile layout |
| `md` | ≥768px | `FilterPanel` becomes persistent sidebar (was drawer) |
| `lg` | ≥1024px | Two-column layouts activate (Search, Dashboard) |
| `xl` | ≥1280px | Max content width 1280px, centered |

Mobile-first Tailwind utility usage throughout; no separate mobile templates.

---

## Chapter 18 — State Management & Data Fetching

- **Server state** (jobs, search results, alerts, bookmarks): React Query — handles caching, refetch-on-focus, optimistic updates for save/unsave actions.
- **Client-only UI state** (modal open/closed, filter panel collapsed): local component state or a minimal Zustand store — never mirrors server data.
- **URL as state** for Search page filters (Chapter 8.2) — enables shareable links and back/forward navigation without extra state management.
- All API calls go through a single typed `lib/api-client.ts` wrapper generated/maintained against Book 3's contracts, so a breaking API change surfaces as a type error at build time.

---

## Chapter 19 — Accessibility Standards

Target: WCAG 2.1 AA.

1. All interactive elements keyboard-navigable, visible focus states (`--color-primary` outline).
2. All images (`CompanyBadge` logos) require `alt` text; decorative icons `aria-hidden`.
3. Color contrast minimum 4.5:1 for body text against background (validated against Chapter 3 palette).
4. Form inputs (`AlertForm`, Login/Register, `ResumeDropzone`) have associated `<label>` elements and error messages linked via `aria-describedby`.
5. `JobCard` save-toggle button has `aria-pressed` state reflecting bookmark status.
6. Semantic HTML first (`<nav>`, `<main>`, `<article>` for job listings) before ARIA roles.

---

## Chapter 20 — SEO Strategy

1. SSR for Homepage, Search, Job Detail, Company Profile (Chapter 1.2 Rule 4) — critical since organic search traffic is a primary acquisition channel (Book 1 Ch. 3).
2. Job Detail pages emit `JobPosting` structured data (schema.org) matching the same schema JobAtlas itself parses from company websites (Book 4, Ch. 10.1) — reciprocal correctness.
3. Dynamic `<title>`/meta description per job/company page, generated from `title` + `company.name` + `location`.
4. `sitemap.xml` generated incrementally as new active jobs are indexed; expired jobs removed from the sitemap (not the database) on the next generation cycle.
5. Canonical URLs on Job Detail pages to avoid duplicate-content penalties when the same job appears reachable via multiple filter/query paths.

---

## Chapter 21 — Error & Empty States

| Context | Empty State | Error State |
|---|---|---|
| Search, no results | "No jobs match your filters" + Clear Filters | "Something went wrong searching — Retry" |
| Saved Jobs, none saved | "No saved jobs yet" + Browse Jobs CTA | Generic retry |
| Alerts, none created | "No alerts yet" + Create Alert CTA | Generic retry |
| Job Detail, 404 | — | "This job may have expired" + Back to Search |
| Recommendations, no resume | "Upload a resume to get personalized matches" + CTA | — |
| Admin tables, no data | "No records for this filter" | Retry + error code shown (admin-only, technical detail is acceptable here) |

All error states surface `error.code` from Book 3, Chapter 18 in a collapsed "details" section for support/debugging purposes without cluttering the primary message.

---

## Chapter 22 — Checklists & Acceptance Criteria

### 22.1 Completeness Checklist
- [ ] Every page in Book 1 Ch. 15.1 has a corresponding chapter here
- [ ] Every data-fetching call references a specific Book 3 endpoint
- [ ] Every component lists which pages use it (avoids orphaned/duplicate components)
- [ ] Accessibility and SEO requirements are testable (not just aspirational)

### 22.2 Acceptance Criteria for "Book 5 Complete"
- [ ] A frontend engineer or AI coding agent can scaffold every page/component directly from this document without further UX decisions
- [ ] No page in this document requires an API endpoint that doesn't exist in Book 3
- [ ] Design tokens (Ch. 3–5) are sufficient to build a Tailwind config without additional design input

---

## Document Status & Next Steps

This completes **Book 5 — Frontend Documentation, v1.0**. It defines the complete consumer-facing and admin UI layer, built entirely on top of the Public API defined in Book 3.

**Feeds directly into:**
- **Book 6 — AI Documentation**, which defines the models/prompts behind the `MatchScoreBadge` (Ch. 6) and Resume Upload flow (Ch. 13).
- **Book 7 — Deployment & Scaling**, which will define how the Next.js app is built, containerized, and served behind Traefik/CDN.

**Status: ✅ Book 5 Complete — Ready to proceed to Book 6 (AI Documentation).**
