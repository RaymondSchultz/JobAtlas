import { z } from "zod";

export const jobEnvelopeSchema = z.object({
  source: z.string().min(1).optional().default("workday"),
  fetchedAt: z.string().optional(),
  raw: z.unknown(),
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export interface NormalizedJob {
  source: string;
  externalId: string;
  companyName: string;
  companySlug: string;
  title: string;
  description: string;
  descriptionHtml?: string | null;
  locationRaw?: string | null;
  isRemote: boolean;
  employmentType: "full_time" | "part_time" | "contract" | "internship" | "temporary" | "unknown";
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  postedAt?: string | null;
  applyUrl: string;
}

export interface RejectedJob {
  action: "rejected";
  reason: string;
  validationErrors: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function textFromHtml(html?: string) {
  return html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function normalizeEmployment(value: string): NormalizedJob["employmentType"] {
  const normalized = value.toLowerCase().replace(/[-\s]+/g, "_");
  if (["full_time", "part_time", "contract", "internship", "temporary"].includes(normalized)) {
    return normalized as NormalizedJob["employmentType"];
  }
  return "unknown";
}

function deriveCompanyName(envelope: JobEnvelope, raw: Record<string, unknown>) {
  return firstString(raw.company, raw.companyName, raw.organization, raw.department, envelope.source);
}

export function normalizeJob(envelope: JobEnvelope, rawJob: unknown): NormalizedJob | RejectedJob {
  const raw = asRecord(rawJob);
  const categories = asRecord(raw.categories);
  const location = asRecord(raw.location);

  const externalId = firstString(raw.externalId, raw.id, raw.jobId, raw.requisitionId, raw.reqId, raw.externalPath, raw.absolute_url, raw.hostedUrl, raw.jobUrl, raw.applyUrl, raw.url);
  const title = firstString(raw.title, raw.text, raw.name, raw.jobTitle);
  const applyUrl = firstString(raw.applyUrl, raw.absolute_url, raw.hostedUrl, raw.jobUrl, raw.url) || (raw.externalPath ? `https://workday.com${raw.externalPath}` : undefined) || (title ? `https://jobatlas.io/jobs/${encodeURIComponent(title)}` : "https://jobatlas.io");
  const descriptionHtml = firstString(raw.descriptionHtml, raw.content, raw.description);
  const description = firstString(raw.description, raw.descriptionPlain, raw.descriptionText, textFromHtml(descriptionHtml)) || title || "Position description available on employer site.";
  const locationRaw = firstString(raw.locationRaw, location.name, raw.locationsText, raw.location, categories.location);
  const companyName = deriveCompanyName(envelope, raw);
  const errors: string[] = [];

  if (!externalId) errors.push("externalId is required");
  if (!title) errors.push("title is required");
  if (!applyUrl) errors.push("applyUrl is required");
  if (!description) errors.push("description is required");

  if (errors.length > 0) {
    return {
      action: "rejected",
      reason: "NORMALIZATION_FAILED",
      validationErrors: errors,
    };
  }

function safeDateString(val?: string | null): string | null {
  if (!val) return null;
  const parsed = Date.parse(val);
  if (isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

  const companySlug = (firstString(raw.companySlug, companyName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")) || "unknown-company";

  return {
    source: envelope.source,
    externalId: externalId!,
    companyName: companyName!,
    companySlug,
    title: title!,
    description: description!,
    descriptionHtml: descriptionHtml || null,
    locationRaw: locationRaw || null,
    isRemote: /remote/i.test(locationRaw) || raw.isRemote === true || raw.remote === true,
    employmentType: normalizeEmployment(firstString(raw.employmentType, raw.commitment, categories.commitment)),
    salaryMin: typeof raw.salaryMin === "number" ? raw.salaryMin : null,
    salaryMax: typeof raw.salaryMax === "number" ? raw.salaryMax : null,
    currency: firstString(raw.currency).slice(0, 3).toUpperCase() || null,
    postedAt: safeDateString(firstString(raw.postedAt, raw.updatedAt, raw.updated_at, raw.createdAt)),
    applyUrl,
  };
}

export function extractJobsFromEnvelope(envelope: JobEnvelope) {
  const raw = asRecord(envelope.raw);
  if (Array.isArray(envelope.raw)) return envelope.raw;
  if (Array.isArray(raw.jobs)) return raw.jobs;
  if (Array.isArray(raw.postings)) return raw.postings;
  if (Array.isArray(raw.jobPostings)) return raw.jobPostings;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.results)) return raw.results;
  return [envelope.raw];
}
