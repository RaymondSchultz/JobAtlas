/**
 * A job mapped onto the keys `normalizeJob` treats as first-priority aliases.
 *
 * Connectors emit this shape rather than raw vendor JSON: no upstream feed uses
 * field names the normalizer recognises (RemoteOK calls the title `position`,
 * Remotive calls the company `company_name`), so the per-source mapping has to
 * live somewhere. Keeping it in the connector leaves `normalizeJob` generic.
 *
 * `description` is intentionally omitted — the normalizer derives plain text
 * from `descriptionHtml` when no explicit description is present.
 */
export interface CanonicalJob {
  externalId: string;
  title: string;
  companyName?: string;
  applyUrl: string;
  descriptionHtml?: string;
  description?: string;
  locationRaw?: string;
  isRemote?: boolean;
  employmentType?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  postedAt?: string | null;
}

export interface ConnectorContext {
  signal: AbortSignal;
  log: (message: string) => void;
}

export interface SourceConnector {
  /** Envelope `source` value and the `sources.name` row. Lowercase, stable. */
  key: string;
  displayName: string;
  /** Standard 5-field cron expression. */
  cron: string;
  /** Connector is skipped when any of these env vars is unset or blank. */
  requiredEnv?: string[];
  fetch(ctx: ConnectorContext): Promise<CanonicalJob[]>;
}
