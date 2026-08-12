import type { SourceConnector } from "../types.js";
import { remoteOkConnector } from "./remoteok.js";
import { remotiveConnector } from "./remotive.js";
import { weWorkRemotelyConnector } from "./weworkremotely.js";

/**
 * Phase 1: the three feeds that need no credentials. Keyed aggregators
 * (Adzuna, Jooble, Careerjet) and the per-company ATS connectors land here too
 * once their credentials and `source_configs` rows exist — `requiredEnv` keeps
 * an unconfigured connector out of the schedule rather than failing nightly.
 */
export const connectors: SourceConnector[] = [
  remotiveConnector,
  remoteOkConnector,
  weWorkRemotelyConnector,
];

export function getConnector(key: string): SourceConnector | undefined {
  return connectors.find((connector) => connector.key === key.toLowerCase());
}

export function missingEnv(connector: SourceConnector): string[] {
  return (connector.requiredEnv ?? []).filter((name) => !process.env[name]?.trim());
}

/** Connectors whose credentials are all present. */
export function runnableConnectors(): SourceConnector[] {
  return connectors.filter((connector) => missingEnv(connector).length === 0);
}
