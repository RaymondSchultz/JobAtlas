import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "n8n-workflows"


def node(name, node_type, x, y, parameters=None):
    return {
        "parameters": parameters or {},
        "id": name.lower().replace(" ", "-").replace("/", "-"),
        "name": name,
        "type": node_type,
        "typeVersion": 1,
        "position": [x, y],
    }


def connect(*pairs):
    connections = {}
    for source, target in pairs:
        connections.setdefault(source, {"main": [[]]})
        connections[source]["main"][0].append({"node": target, "type": "main", "index": 0})
    return connections


def schedule(cron):
    return {
        "rule": {
            "interval": [
                {
                    "field": "cronExpression",
                    "expression": cron,
                }
            ]
        }
    }


def http(method, url, body=None, headers=None, retry=True):
    params = {
        "method": method,
        "url": url,
        "sendHeaders": bool(headers),
        "sendBody": body is not None,
        "options": {
            "timeout": 60000,
        },
    }
    if headers:
        params["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in headers.items()]}
    if body is not None:
        params["contentType"] = "json"
        params["jsonBody"] = body
    if retry:
        params["retryOnFail"] = True
        params["maxTries"] = 5
        params["waitBetweenTries"] = 30000
    return params


INTERNAL_HEADERS = {"X-Service-Key": "={{$env.INTERNAL_SERVICE_KEY}}"}
INTERNAL_BASE = "={{$env.INTERNAL_API_BASE_URL || 'https://internal.jobatlas.io/api/v1'}}"


def collector_workflow(name, cron, source, company_query, fetch_url, batch_size=5, method="GET", body=None):
    nodes = [
        node("Schedule", "n8n-nodes-base.scheduleTrigger", 0, 0, schedule(cron)),
        node("Read Active Sources", "n8n-nodes-base.postgres", 240, 0, {
            "operation": "executeQuery",
            "query": company_query,
        }),
        node("Loop Source Records", "n8n-nodes-base.splitInBatches", 480, 0, {"batchSize": batch_size}),
        node("Fetch Source Jobs", "n8n-nodes-base.httpRequest", 720, 0, http(method, fetch_url, body)),
        node("Build Processor Envelope", "n8n-nodes-base.set", 960, 0, {
            "mode": "raw",
            "jsonOutput": json.dumps({
                "source": source,
                "fetchedAt": "={{$now.toISO()}}",
                "raw": "={{$json}}"
            }),
            "options": {},
        }),
        node("POST Internal Jobs Batch", "n8n-nodes-base.httpRequest", 1200, 0, http(
            "POST",
            f"{INTERNAL_BASE}/internal/jobs/batch",
            "={{$json}}",
            INTERNAL_HEADERS,
        )),
        node("Log Sync Summary", "n8n-nodes-base.httpRequest", 1440, 0, http(
            "POST",
            f"{INTERNAL_BASE}/internal/workflow-logs",
            "={{ { workflowName: $workflow.name, source: '" + source + "', status: 'success', finishedAt: $now.toISO(), response: $json } }}",
            INTERNAL_HEADERS,
            retry=False,
        )),
    ]
    return {
        "name": name,
        "nodes": nodes,
        "connections": connect(
            ("Schedule", "Read Active Sources"),
            ("Read Active Sources", "Loop Source Records"),
            ("Loop Source Records", "Fetch Source Jobs"),
            ("Fetch Source Jobs", "Build Processor Envelope"),
            ("Build Processor Envelope", "POST Internal Jobs Batch"),
            ("POST Internal Jobs Batch", "Log Sync Summary"),
        ),
        "settings": {"executionTimeout": 900, "saveExecutionProgress": True, "saveManualExecutions": True},
        "active": False,
    }


def maintenance_workflow(name, cron, endpoint, body):
    return {
        "name": name,
        "nodes": [
            node("Schedule", "n8n-nodes-base.scheduleTrigger", 0, 0, schedule(cron)),
            node("Call Internal API", "n8n-nodes-base.httpRequest", 280, 0, http(
                "POST",
                f"{INTERNAL_BASE}{endpoint}",
                body,
                INTERNAL_HEADERS,
            )),
            node("Log Workflow Result", "n8n-nodes-base.httpRequest", 560, 0, http(
                "POST",
                f"{INTERNAL_BASE}/internal/workflow-logs",
                "={{ { workflowName: $workflow.name, status: 'success', finishedAt: $now.toISO(), response: $json } }}",
                INTERNAL_HEADERS,
                retry=False,
            )),
        ],
        "connections": connect(("Schedule", "Call Internal API"), ("Call Internal API", "Log Workflow Result")),
        "settings": {"executionTimeout": 600, "saveExecutionProgress": True},
        "active": False,
    }


def simple_workflows():
    return {
        "01-greenhouse-fetch-jobs.json": collector_workflow(
            "Jobs/Greenhouse/Fetch Jobs",
            "*/15 * * * *",
            "greenhouse",
            "SELECT external_ref FROM companies WHERE source='greenhouse' AND is_active=true",
            "={{'https://boards-api.greenhouse.io/v1/boards/' + $json.external_ref + '/jobs?content=true'}}",
        ),
        "02-lever-fetch-jobs.json": collector_workflow(
            "Jobs/Lever/Fetch Jobs",
            "*/15 * * * *",
            "lever",
            "SELECT external_ref FROM companies WHERE source='lever' AND is_active=true",
            "={{'https://api.lever.co/v0/postings/' + $json.external_ref + '?mode=json'}}",
        ),
        "03-ashby-fetch-jobs.json": collector_workflow(
            "Jobs/Ashby/Fetch Jobs",
            "*/15 * * * *",
            "ashby",
            "SELECT external_ref FROM companies WHERE source='ashby' AND is_active=true",
            "={{'https://api.ashbyhq.com/posting-api/job-board/' + $json.external_ref}}",
        ),
        "04-workday-fetch-jobs.json": collector_workflow(
            "Jobs/Workday/Fetch Jobs",
            "0 * * * *",
            "workday",
            "SELECT external_ref, base_url FROM companies WHERE source='workday' AND is_active=true",
            "={{$json.base_url + '/wday/cxs/' + $json.external_ref + '/jobs'}}",
            batch_size=2,
            method="POST",
            body='={{ { limit: 100, offset: $json.offset || 0, searchText: "" } }}',
        ),
        "05-government-fetch-jobs.json": collector_workflow(
            "Jobs/Government/Fetch Jobs",
            "0 * * * *",
            "government",
            "SELECT external_ref, base_url FROM companies WHERE source='government' AND is_active=true",
            "={{$json.base_url}}",
        ),
        "06-company-website-crawl-jobs.json": collector_workflow(
            "Jobs/CompanyWebsites/Crawl Jobs",
            "0 */12 * * *",
            "company_website",
            "SELECT external_ref, website FROM companies WHERE source='company_website' AND is_active=true",
            "={{$json.website}}",
            batch_size=1,
        ),
        "10-cleanup.json": maintenance_workflow(
            "Maintenance/Cleanup",
            "0 2 * * *",
            "/internal/jobs/expire-check",
            '{"olderThanDays":30}',
        ),
        "11-health-check.json": maintenance_workflow(
            "Maintenance/Health Check",
            "*/5 * * * *",
            "/internal/health/source-check",
            "={{ { checkedAt: $now.toISO(), maxMissedCycles: 2, minSuccessRate7d: 0.9 } }}",
        ),
        "12-retry-failed-jobs.json": maintenance_workflow(
            "Maintenance/Retry Failed Jobs",
            "*/30 * * * *",
            "/internal/workflows/retry-failed-jobs",
            "={{ { sinceHours: 24, maxRetryCount: 3 } }}",
        ),
        "13-job-alerts.json": {
            "name": "Notifications/Job Alerts",
            "nodes": [
                node("Instant Alert Webhook", "n8n-nodes-base.webhook", 0, -120, {
                    "path": "jobatlas/job-alerts/instant",
                    "httpMethod": "POST",
                    "responseMode": "lastNode",
                }),
                node("Daily Digest Schedule", "n8n-nodes-base.scheduleTrigger", 0, 80, schedule("0 8 * * *")),
                node("Weekly Digest Schedule", "n8n-nodes-base.scheduleTrigger", 0, 280, schedule("0 8 * * 1")),
                node("Find Matching Alerts", "n8n-nodes-base.httpRequest", 320, 80, http(
                    "POST",
                    f"{INTERNAL_BASE}/internal/alerts/match",
                    "={{$json}}",
                    INTERNAL_HEADERS,
                )),
                node("Dispatch Notifications", "n8n-nodes-base.executeWorkflow", 640, 80, {
                    "workflowId": "Notifications/Email Alerts",
                    "options": {},
                }),
            ],
            "connections": connect(
                ("Instant Alert Webhook", "Find Matching Alerts"),
                ("Daily Digest Schedule", "Find Matching Alerts"),
                ("Weekly Digest Schedule", "Find Matching Alerts"),
                ("Find Matching Alerts", "Dispatch Notifications"),
            ),
            "settings": {"executionTimeout": 900, "saveExecutionProgress": True},
            "active": False,
        },
        "14-email-alerts.json": {
            "name": "Notifications/Email Alerts",
            "nodes": [
                node("Execute Workflow Trigger", "n8n-nodes-base.executeWorkflowTrigger", 0, 0, {}),
                node("Render Email Payload", "n8n-nodes-base.set", 280, 0, {
                    "mode": "raw",
                    "jsonOutput": '={{ { to: $json.user.email, subject: "New JobAtlas matches", html: $json.html || JSON.stringify($json.matchedJobs) } }}',
                }),
                node("Send Email", "n8n-nodes-base.emailSend", 560, 0, {
                    "fromEmail": "={{$env.ALERT_FROM_EMAIL}}",
                    "toEmail": "={{$json.to}}",
                    "subject": "={{$json.subject}}",
                    "html": "={{$json.html}}",
                }),
                node("Log Delivery", "n8n-nodes-base.httpRequest", 840, 0, http(
                    "POST",
                    f"{INTERNAL_BASE}/internal/workflow-logs",
                    "={{ { workflowName: $workflow.name, status: 'success', finishedAt: $now.toISO(), response: $json } }}",
                    INTERNAL_HEADERS,
                    retry=False,
                )),
            ],
            "connections": connect(
                ("Execute Workflow Trigger", "Render Email Payload"),
                ("Render Email Payload", "Send Email"),
                ("Send Email", "Log Delivery"),
            ),
            "settings": {"executionTimeout": 600, "saveExecutionProgress": True},
            "active": False,
        },
        "15-resume-processing.json": {
            "name": "AI/Resume Processing",
            "nodes": [
                node("Resume Webhook", "n8n-nodes-base.webhook", 0, 0, {
                    "path": "jobatlas/resume-processing",
                    "httpMethod": "POST",
                    "responseMode": "lastNode",
                }),
                node("Fetch Resume File", "n8n-nodes-base.httpRequest", 280, 0, http("GET", "={{$json.fileUrl}}")),
                node("Parse Resume via AI API", "n8n-nodes-base.httpRequest", 560, 0, http(
                    "POST",
                    f"{INTERNAL_BASE}/internal/ai/resume/parse",
                    "={{ { resumeId: $json.resumeId, fileContent: $binary || $json } }}",
                    INTERNAL_HEADERS,
                )),
                node("Trigger AI Matching", "n8n-nodes-base.httpRequest", 840, 0, http(
                    "POST",
                    f"{INTERNAL_BASE}/internal/ai/matching/run",
                    "={{ { resumeId: $json.resumeId } }}",
                    INTERNAL_HEADERS,
                )),
            ],
            "connections": connect(
                ("Resume Webhook", "Fetch Resume File"),
                ("Fetch Resume File", "Parse Resume via AI API"),
                ("Parse Resume via AI API", "Trigger AI Matching"),
            ),
            "settings": {"executionTimeout": 1800, "saveExecutionProgress": True},
            "active": False,
        },
        "16-ai-matching.json": {
            "name": "AI/AI Matching",
            "nodes": [
                node("Matching Webhook", "n8n-nodes-base.webhook", 0, -80, {
                    "path": "jobatlas/ai-matching",
                    "httpMethod": "POST",
                    "responseMode": "lastNode",
                }),
                node("Nightly Matching Schedule", "n8n-nodes-base.scheduleTrigger", 0, 120, schedule("0 1 * * *")),
                node("Run Matching", "n8n-nodes-base.httpRequest", 320, 20, http(
                    "POST",
                    f"{INTERNAL_BASE}/internal/ai/matching/run",
                    "={{$json}}",
                    INTERNAL_HEADERS,
                )),
                node("Log Matching Result", "n8n-nodes-base.httpRequest", 640, 20, http(
                    "POST",
                    f"{INTERNAL_BASE}/internal/workflow-logs",
                    "={{ { workflowName: $workflow.name, status: 'success', finishedAt: $now.toISO(), response: $json } }}",
                    INTERNAL_HEADERS,
                    retry=False,
                )),
            ],
            "connections": connect(
                ("Matching Webhook", "Run Matching"),
                ("Nightly Matching Schedule", "Run Matching"),
                ("Run Matching", "Log Matching Result"),
            ),
            "settings": {"executionTimeout": 3600, "saveExecutionProgress": True},
            "active": False,
        },
    }


def main():
    OUT.mkdir(exist_ok=True)
    for filename, workflow in simple_workflows().items():
        (OUT / filename).write_text(json.dumps(workflow, indent=2) + "\n", encoding="utf-8")

    (OUT / "README.md").write_text(
        """# JobAtlas n8n Workflows

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
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
