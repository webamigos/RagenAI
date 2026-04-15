import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

/**
 * Shape of the successful `rejestrio__get_krs_info` tool result.
 * Mirrors `GetKrsInfoSuccess` in ragen-mcp/services/rejestrio; we
 * duplicate here rather than share a types package because the MCP
 * service is a separate repo. If the shapes drift, tests catch it.
 */
export type RejestrioGetKrsInfoResult = {
  success: true;
  krs: number;
  nip: string | null;
  nazwaPelna: string;
  pkdGlowny: string | null;
  formaPrawna: string | null;
  stan: {
    wykreslona: boolean;
    wUpadlosci: boolean;
    wLikwidacji: boolean;
    naGpw: boolean;
  };
  ostatnieSprawozdanie: {
    rocznik?: number;
    przychody?: number;
    zysk?: number;
  } | null;
};

/**
 * Shape of the successful `rejestrio__get_financials` tool result —
 * the subset we care to persist.
 */
export type RejestrioGetFinancialsResult = {
  success: true;
  krs: number;
  statements: Array<{
    rocznik: number | null;
    source: string;
    przychody?: number | null;
    zysk?: number | null;
  }>;
};

type Input = {
  organizationId: string;
  toolName: string;
  result: unknown;
};

/**
 * Parse a Rejestrio MCP tool result and upsert the RejestrioLead snapshot.
 *
 * Never throws — enrichment is best-effort. Failures are logged but
 * don't break the chat stream.
 *
 * Idempotent on (organizationId, krs) and (organizationId, nip) —
 * repeated tool calls for the same company refresh the snapshot.
 */
export async function upsertRejestrioLeadCommand(input: Input): Promise<void> {
  try {
    const { organizationId, toolName } = input;
    const payload = parseResult(input.result);
    if (!payload) {
      return;
    }

    if (toolName === 'rejestrio__get_krs_info') {
      await upsertFromKrsInfo(
        organizationId,
        payload as RejestrioGetKrsInfoResult,
      );
    } else if (toolName === 'rejestrio__get_financials') {
      await upsertFromFinancials(
        organizationId,
        payload as RejestrioGetFinancialsResult,
      );
    }
    // Other Rejestrio tools (lookup_company etc.) don't populate
    // enough company data to be worth a snapshot write.
  } catch (err) {
    logger.warn(
      { err, toolName: input.toolName },
      'upsertRejestrioLead failed — swallowing; lead snapshot is best-effort',
    );
  }
}

function parseResult(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }
  return null;
}

async function upsertFromKrsInfo(
  organizationId: string,
  r: RejestrioGetKrsInfoResult,
): Promise<void> {
  if (!r.success || !r.krs) {
    return;
  }
  const snapshot = r.ostatnieSprawozdanie ?? null;
  // Defensive — `stan` is declared non-optional in the type but the
  // real shape at the wire boundary can drop fields if the MCP tool
  // errors mid-response or the upstream changes. Default to an empty
  // record so every flag coerces to null/undefined rather than a
  // TypeError.
  const stan = r.stan ?? {};
  const data = {
    nip: r.nip,
    companyName: r.nazwaPelna,
    pkdMain: r.pkdGlowny,
    formaPrawna: r.formaPrawna,
    isWykreslona: stan.wykreslona ?? null,
    isLiquidation: stan.wLikwidacji ?? null,
    isBankrupt: stan.wUpadlosci ?? null,
    isNaGpw: stan.naGpw ?? null,
    revenueLast: snapshot?.przychody ?? null,
    profitLast: snapshot?.zysk ?? null,
    revenueRocznik: snapshot?.rocznik ?? null,
    enrichedAt: new Date(),
    enrichmentSource: 'rejestrio',
  };
  await db.rejestrioLead.upsert({
    where: { organizationId_krs: { organizationId, krs: r.krs } },
    update: data,
    create: { organizationId, krs: r.krs, ...data },
  });
}

async function upsertFromFinancials(
  organizationId: string,
  r: RejestrioGetFinancialsResult,
): Promise<void> {
  if (!r.success || !r.krs || !r.statements?.length) {
    return;
  }
  // Prefer the most-recent populated statement (skip `unavailable`).
  const latest = r.statements
    .filter((s) => s.rocznik != null && s.source !== 'unavailable')
    .sort((a, b) => (b.rocznik ?? 0) - (a.rocznik ?? 0))[0];
  if (!latest) {
    return;
  }
  await db.rejestrioLead.upsert({
    where: { organizationId_krs: { organizationId, krs: r.krs } },
    update: {
      revenueLast: latest.przychody ?? null,
      profitLast: latest.zysk ?? null,
      revenueRocznik: latest.rocznik ?? null,
      enrichedAt: new Date(),
      enrichmentSource: 'rejestrio',
    },
    create: {
      organizationId,
      krs: r.krs,
      revenueLast: latest.przychody ?? null,
      profitLast: latest.zysk ?? null,
      revenueRocznik: latest.rocznik ?? null,
      enrichedAt: new Date(),
      enrichmentSource: 'rejestrio',
    },
  });
}
