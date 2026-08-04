# JobAtlas Backend

TypeScript/Express backend implementing the API contract from `03-API-Specification.md` and the database schema from `02-Database-Design.md`.

## Current scope

- Public API skeleton:
  - auth
  - jobs
  - search
  - companies
  - filters/categories/skills
  - bookmarks
  - alerts
  - resume/recommendations
  - admin read endpoints
- Internal API for n8n:
  - `POST /api/v1/internal/jobs`
  - `POST /api/v1/internal/jobs/batch`
  - `POST /api/v1/internal/jobs/expire-check`
  - workflow logging
  - source health check
  - retry candidate lookup
  - alert/AI orchestration stubs
- PostgreSQL migration:
  - Book 2 core schema
  - `source_configs` support table for collector configuration
  - `resume_profiles.status`, required by Books 4–6

## Setup

```bash
cd backend
copy .env.example .env
npm install
npm run migrate
npm run dev
```

## Docker Compose

From the repository root:

```bash
docker compose up --build
```

This starts:

- PostgreSQL 15 on `localhost:5432`
- Backend API on `localhost:4000`

The backend container waits for PostgreSQL, runs migrations, then starts the API.

Local defaults are defined in the root `docker-compose.yml`. Override them with a root `.env` file if needed:

```env
POSTGRES_DB=jobatlas
POSTGRES_USER=jobatlas
POSTGRES_PASSWORD=change-me
POSTGRES_PORT=5432
BACKEND_PORT=4000
JWT_SECRET=change-me
INTERNAL_SERVICE_KEY=change-me-internal-service-key
```

Health check:

```bash
curl http://localhost:4000/health
```

Required environment variables:

- `DATABASE_URL`
- `INTERNAL_SERVICE_KEY`
- `JWT_SECRET`

## Verification

```bash
npm run typecheck
npm run build
npm test
```

## Notes

The n8n workflows currently created in the n8n instance are draft/inactive. Activate them only after:

1. this backend is deployed,
2. migrations are applied,
3. `INTERNAL_API_BASE_URL` points to this backend,
4. `INTERNAL_SERVICE_KEY` matches n8n,
5. source credentials/config values are installed in n8n.
