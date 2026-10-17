import 'server-only';

import { checkBasalHealth, isBasalConfigured } from '@ragenai/basal-client';
import { gatewayFromEnv } from '@ragenai/llm-gateway';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

import type { DatabaseProbe, SetupStatus } from '../../contracts/types';
import { inspectEnvironment } from './inspect-environment';
import {
  findModelServerProblems,
  probedModels,
} from './find-model-server-problems';
import { getParserStatusQuery } from '@/features/parsing/services/queries/get-parser-status-query';
import { backfillClaimIfAdminExists, isInstallClaimed } from '../install-claim';

/**
 * Everything the first-run screens need to tell an operator where they stand.
 *
 * Deliberately never throws. This runs on the sign-in path, and the whole point
 * is to replace a stack trace with a readable list — a diagnostics screen that
 * crashes when the thing it diagnoses is broken would be worse than none.
 */
export async function getSetupStatusQuery(): Promise<SetupStatus> {
  const report = inspectEnvironment(process.env);

  let database: DatabaseProbe = { reachable: true };
  let adminExists: boolean | null = null;
  let claimed: boolean | null = null;

  try {
    // Counting admins doubles as the connectivity probe — one round trip
    // answers both "is Postgres there" and "has anyone claimed this install".
    const admin = await db.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    });
    adminExists = admin !== null;

    // An install that predates the claim marker gets one now, so that
    // removing its last admin cannot reopen the first-run screen. This runs
    // on the sign-in path too, which is why an install in daily use fixes
    // itself without anyone visiting a setup URL.
    await backfillClaimIfAdminExists(adminExists);
    claimed = await isInstallClaimed();
  } catch (error) {
    // Always logged in full. Only surfaced to the browser outside production:
    // this renders on the unauthenticated sign-in page, and a driver error can
    // carry the host, port and user from the connection string.
    logger.error({ err: error }, 'Database unreachable during setup check');

    const detail = error instanceof Error ? error.message : String(error);

    database = {
      reachable: false,
      message: process.env.NODE_ENV === 'production' ? undefined : detail,
    };
  }

  // Docling's outage, as the worker last saw it (Docling spec C1, D5). A
  // runtime state rather than a configuration mistake, so it is only ever
  // `recommended`: sign-in works without it, uploads wait or fall back. No
  // address or detail, because this page is shown before anyone signs in.
  const parser = await getParserStatusQuery();
  if (parser.state === 'down') {
    report.findings.push({
      id: 'docling-unavailable',
      severity: 'recommended',
      vars: ['DOCLING_URL'],
      // A timestamp, formatted by the message (`{since, time, short}`): this
      // runs on the server, which does not know the reader's locale.
      values: { since: Date.parse(parser.since) },
      example: 'docker compose ps docling',
    });
  }

  // basal, when this installation has one (basal spec, B3). Not configured
  // says nothing, as Presidio's absence says nothing: it is optional. Down is
  // `recommended` for the same reason as Docling's: nothing breaks, the
  // guardrail first pass falls through to the judge model and every turn
  // waits for it as it would without basal.
  if (isBasalConfigured()) {
    const basal = await checkBasalHealth({
      url: process.env.BASAL_URL!,
      ...(process.env.BASAL_API_KEY
        ? { apiKey: process.env.BASAL_API_KEY }
        : {}),
    });
    if (basal === 'down') {
      report.findings.push({
        id: 'basal-unavailable',
        severity: 'recommended',
        vars: ['BASAL_URL'],
        example: 'docker compose --profile basal ps basal',
      });
    }
  }

  // A local model server (Ollama, vLLM) that is down, or a model it never
  // pulled (appliance spec, B3). Free to ask — one `GET /models` per server —
  // and only for `openai-compatible` routes; see `probeModels`.
  report.findings.push(...(await modelServerFindings()));

  return { report, database, adminExists, claimed };
}

/**
 * Cached briefly because this runs on every sign-in page load, and a model
 * server's state does not change between two of them. Thirty seconds is short
 * enough that an operator who just started Ollama sees the finding go on the
 * next reload but one.
 */
const MODEL_PROBE_TTL_MS = 30_000;
let modelProbeCache: {
  at: number;
  findings: Awaited<ReturnType<typeof findModelServerProblems>>;
} | null = null;

async function modelServerFindings() {
  if (modelProbeCache && Date.now() - modelProbeCache.at < MODEL_PROBE_TTL_MS) {
    return modelProbeCache.findings;
  }
  try {
    const selectedBy = probedModels(process.env);
    const probes = await gatewayFromEnv().probe([...selectedBy.keys()]);
    const findings = findModelServerProblems(probes, selectedBy);
    modelProbeCache = { at: Date.now(), findings };
    return findings;
  } catch (error) {
    // An unreadable route table is reported where it is read; it is not this
    // check's finding to make, and this page must not fail because of it.
    logger.warn({ err: error }, 'Could not probe the model servers');
    return [];
  }
}

/** For tests: forget the cached probe. */
export function resetModelProbeCache(): void {
  modelProbeCache = null;
}
