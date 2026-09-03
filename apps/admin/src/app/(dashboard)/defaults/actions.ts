'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

import {
  buildUpdate,
  previewOrg,
  type OrgCurrent,
  type OrgPreview,
  type PropagationGroup,
  type ResolvedDefaults,
} from './propagation';

/**
 * Applying a changed platform default to organizations that already exist.
 *
 * The reasoning about which defaults are worth propagating, and what
 * propagation cannot do, lives in `propagation.ts` beside the pure diff.
 * What is here is the database work: reading the current state, and writing
 * only the organizations that would actually move.
 */

const DEFAULT_LIMITS_KEY = 'default_organization_limits';
const DEFAULT_MODELS_KEY = 'default_allowed_models';
const DEFAULT_RAG_KEY = 'default_rag_pipeline_settings';

/**
 * Read the three defaults straight from `Settings`.
 *
 * apps/web's getters would be the obvious reuse, and they are deliberately
 * not used: each substitutes its own hardcoded fallback for a missing or
 * malformed row, so `getDefaultOrganizationLimits()` cannot tell "the
 * administrator set 5 GB" apart from "there is no row and the source says
 * 5 GB". A preview built on that would promise to write values nobody chose.
 * Reading the row directly means an unconfigured default propagates nothing,
 * which is the honest answer.
 */
async function readDefaults(): Promise<ResolvedDefaults> {
  const rows = await prisma.settings.findMany({
    where: {
      key: { in: [DEFAULT_LIMITS_KEY, DEFAULT_MODELS_KEY, DEFAULT_RAG_KEY] },
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  function parse<T>(key: string, fallback: T): T {
    const raw = byKey.get(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  const limits = parse<Partial<ResolvedDefaults['limits']>>(
    DEFAULT_LIMITS_KEY,
    {},
  );
  const models = parse<string[]>(DEFAULT_MODELS_KEY, []);
  // Absence is meaningful, so it is preserved rather than filled in. See the
  // note on `ResolvedDefaults.rag`.
  const ragRaw = byKey.has(DEFAULT_RAG_KEY)
    ? parse<Partial<NonNullable<ResolvedDefaults['rag']>> | null>(
        DEFAULT_RAG_KEY,
        null,
      )
    : null;

  return {
    limits: {
      storageLimitBytes: limits.storageLimitBytes ?? null,
      projectStorageLimitBytes: limits.projectStorageLimitBytes ?? null,
      singleFileLimitBytes: limits.singleFileLimitBytes ?? null,
      monthlyTokenLimit: limits.monthlyTokenLimit ?? null,
      monthlyCostLimitCents: limits.monthlyCostLimitCents ?? null,
      monthlyMessageLimit: limits.monthlyMessageLimit ?? null,
      monthlyApiRequestLimit: limits.monthlyApiRequestLimit ?? null,
      maxMembers: limits.maxMembers ?? null,
    },
    allowedModels: Array.isArray(models) ? models : [],
    // Every one of the four must be present. A partially written row would
    // otherwise have its gaps filled with invented booleans, which is the
    // one thing this must not do.
    rag:
      ragRaw &&
      typeof ragRaw.multiQueryEnabled === 'boolean' &&
      typeof ragRaw.docSummariesEnabled === 'boolean' &&
      typeof ragRaw.contentModerationEnabled === 'boolean' &&
      typeof ragRaw.rerankingEnabled === 'boolean'
        ? {
            multiQueryEnabled: ragRaw.multiQueryEnabled,
            docSummariesEnabled: ragRaw.docSummariesEnabled,
            contentModerationEnabled: ragRaw.contentModerationEnabled,
            rerankingEnabled: ragRaw.rerankingEnabled,
          }
        : null,
  };
}

async function readOrgs(): Promise<OrgCurrent[]> {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          storageLimitBytes: true,
          projectStorageLimitBytes: true,
          singleFileLimitBytes: true,
          monthlyTokenLimit: true,
          monthlyCostLimitCents: true,
          monthlyMessageLimit: true,
          monthlyApiRequestLimit: true,
          maxMembers: true,
          allowedModels: true,
          multiQueryEnabled: true,
          docSummariesEnabled: true,
          contentModerationEnabled: true,
          rerankingEnabled: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return orgs.map((org) => ({
    organizationId: org.id,
    organizationName: org.name,
    // An organization with no settings row at all is the commonest reason a
    // configured default never reached it, so it is included with every
    // value unset rather than skipped.
    storageLimitBytes: org.settings?.storageLimitBytes ?? null,
    projectStorageLimitBytes: org.settings?.projectStorageLimitBytes ?? null,
    singleFileLimitBytes: org.settings?.singleFileLimitBytes ?? null,
    monthlyTokenLimit: org.settings?.monthlyTokenLimit ?? null,
    monthlyCostLimitCents: org.settings?.monthlyCostLimitCents ?? null,
    monthlyMessageLimit: org.settings?.monthlyMessageLimit ?? null,
    monthlyApiRequestLimit: org.settings?.monthlyApiRequestLimit ?? null,
    maxMembers: org.settings?.maxMembers ?? null,
    allowedModels: org.settings?.allowedModels ?? [],
    multiQueryEnabled: org.settings?.multiQueryEnabled ?? null,
    docSummariesEnabled: org.settings?.docSummariesEnabled ?? null,
    contentModerationEnabled: org.settings?.contentModerationEnabled ?? null,
    rerankingEnabled: org.settings?.rerankingEnabled ?? null,
  }));
}

export type PropagationPreview = {
  group: PropagationGroup;
  /** Every organization, so "nothing would change" is visible as such. */
  organizations: OrgPreview[];
  changedCount: number;
  /** Fields the default leaves unset. The same for every organization. */
  skippedFields: string[];
  /**
   * Whether this default has been configured at all.
   *
   * Without it the page cannot tell two opposite situations apart, because
   * both produce zero changes: every organization already matches the
   * default, or there is no default to apply. Reporting the second as
   * "2 already match" was actively misleading — it read as reassurance.
   */
  configured: boolean;
};

/**
 * Read-only. Named `get*` so the audit rule in
 * `server-actions-are-guarded` treats it as a reader rather than expecting an
 * entry for a preview nobody acted on.
 */
export async function getPropagationPreviewAction(
  group: PropagationGroup,
): Promise<PropagationPreview> {
  await requireAdmin();

  const [defaults, orgs] = await Promise.all([readDefaults(), readOrgs()]);
  const organizations = orgs.map((org) => previewOrg(group, defaults, org));

  const configured = {
    limits: Object.values(defaults.limits).some((value) => value !== null),
    models: defaults.allowedModels.length > 0,
    rag: defaults.rag !== null,
  }[group];

  return {
    group,
    organizations,
    changedCount: organizations.filter((org) => org.changes.length > 0).length,
    skippedFields: organizations[0]?.skipped ?? [],
    configured,
  };
}

export type ApplyOutcome = {
  applied: number;
  unchanged: number;
};

/**
 * Apply the default to every organization it would actually move.
 *
 * Recomputes the diff rather than trusting a preview passed back from the
 * browser: the two are separated by however long the administrator spent
 * reading, and the numbers on screen are a report, not an instruction.
 *
 * One audit entry per changed organization, because that is where a customer
 * asking "why did my limit change" will look, plus one platform-level
 * security event for the operation as a whole. Unchanged organizations get
 * neither — an entry for a write that did not happen is noise in the one
 * place that must not have any.
 */
export async function applyPropagationAction(
  group: PropagationGroup,
): Promise<ApplyOutcome> {
  const admin = await requireAdmin();

  const [defaults, orgs] = await Promise.all([readDefaults(), readOrgs()]);

  let applied = 0;
  let unchanged = 0;

  for (const org of orgs) {
    const preview = previewOrg(group, defaults, org);
    const data = buildUpdate(group, defaults, preview);

    if (!data) {
      unchanged += 1;
      continue;
    }

    await prisma.organizationSettings.upsert({
      where: { organizationId: org.organizationId },
      update: data,
      create: { organizationId: org.organizationId, ...data },
    });

    await recordAdminAction({
      admin,
      action: ADMIN_ACTIONS.defaultsPropagated,
      entityType: 'organization',
      entityId: org.organizationId,
      organizationId: org.organizationId,
      before: Object.fromEntries(
        preview.changes.map((change) => [change.field, change.before]),
      ),
      after: Object.fromEntries(
        preview.changes.map((change) => [change.field, change.after]),
      ),
    });

    applied += 1;
  }

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.defaultsPropagated,
    entityType: 'defaults',
    entityId: group,
    after: { group, applied, unchanged },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
  });

  revalidatePath('/defaults');
  revalidatePath('/limits');
  revalidatePath('/models');
  revalidatePath('/rag-settings');

  return { applied, unchanged };
}
