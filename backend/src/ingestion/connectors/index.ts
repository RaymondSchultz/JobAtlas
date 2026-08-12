import type { SourceConnector } from "../types.js";
import { adzunaConnector } from "./adzuna.js";
import { arbeitnowConnector } from "./arbeitnow.js";
import { remoteOkConnector } from "./remoteok.js";
import { remotiveConnector } from "./remotive.js";
import { theMuseConnector } from "./themuse.js";
import { weWorkRemotelyConnector } from "./weworkremotely.js";

/**
 * Remote-only boards (Remotive, RemoteOK, We Work Remotely) plus the
 * location-bearing sources that carry actual local hiring: The Muse for the US
 * and Arbeitnow for Germany and the EU.
 *
 * Adzuna is registered but gated on credentials — `requiredEnv` keeps an
 * unconfigured connector out of the schedule rather than failing nightly. The
 * per-company ATS connectors land here once source_configs is populated.
 */
export const connectors: SourceConnector[] = [

  remotiveConnector,
  remoteOkConnector,
  weWorkRemotelyConnector,
  theMuseConnector,
  arbeitnowConnector,
  adzunaConnector,
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
