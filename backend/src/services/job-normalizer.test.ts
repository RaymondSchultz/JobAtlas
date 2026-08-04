import { describe, expect, it } from "vitest";
import { extractJobsFromEnvelope, normalizeJob, type JobEnvelope } from "./job-normalizer.js";

describe("job normalizer", () => {
  it("extracts jobs from a Greenhouse-style envelope", () => {
    const envelope: JobEnvelope = {
      source: "greenhouse",
      fetchedAt: "2026-08-02T10:15:00Z",
      raw: {
        jobs: [
          {
            id: 4827193,
            title: "Senior Backend Engineer",
            location: { name: "Remote - US" },
            absolute_url: "https://job-boards.greenhouse.io/acme/jobs/4827193",
            updated_at: "2026-07-30T10:00:00Z",
            content: "<p>We are looking for builders.</p>",
            company: "Acme",
          },
        ],
      },
    };

    const [rawJob] = extractJobsFromEnvelope(envelope);
    const normalized = normalizeJob(envelope, rawJob);

    expect(normalized).toMatchObject({
      source: "greenhouse",
      externalId: "4827193",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      locationRaw: "Remote - US",
      isRemote: true,
      applyUrl: "https://job-boards.greenhouse.io/acme/jobs/4827193",
    });
  });

  it("rejects records missing required fields", () => {
    const rejected = normalizeJob({ source: "greenhouse", raw: {} }, { id: "1" });

    expect(rejected).toMatchObject({
      action: "rejected",
      reason: "NORMALIZATION_FAILED",
    });
  });
});
