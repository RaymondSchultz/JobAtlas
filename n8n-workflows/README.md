# JobAtlas n8n Workflows

Generated from `04-n8n-Workflows.md`.

Import these JSON files into n8n after configuring credentials/env vars:

- `INTERNAL_API_BASE_URL`
- `INTERNAL_SERVICE_KEY`
- `ALERT_FROM_EMAIL`
- PostgreSQL credential for source reads
- SMTP/transactional email credential for notification dispatch

Workflows 7, 8, and 9 from Book 4 are intentionally not present as n8n workflow JSON files. The spec states they belong inside the Job Processor API:

- Normalization
- Duplicate Detection
- Store Jobs

After import, keep workflows inactive until credentials are attached and test executions pass.
