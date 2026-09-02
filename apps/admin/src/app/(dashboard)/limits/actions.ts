'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { syncOrgToLiteLLM } from '@/lib/litellm';
import { revalidatePath } from 'next/cache';

interface DefaultLimits {
  storageLimitBytes: number | null;
  projectStorageLimitBytes: number | null;
  singleFileLimitBytes: number | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  monthlyApiRequestLimit: number | null;
  maxMembers: number | null;
}

export async function getDefaultLimitsAction(): Promise<DefaultLimits> {
  await requireAdmin();
  const row = await prisma.settings.findUnique({
    where: { key: 'default_organization_limits' },
  });

  if (!row) {
    return {
      storageLimitBytes: 50 * 1024 * 1024,
      projectStorageLimitBytes: 20 * 1024 * 1024,
      singleFileLimitBytes: 5 * 1024 * 1024,
      monthlyTokenLimit: null,
      monthlyCostLimitCents: null,
      monthlyMessageLimit: null,
      monthlyApiRequestLimit: 100,
      maxMembers: null,
    };
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<DefaultLimits>;
    return {
      storageLimitBytes: parsed.storageLimitBytes ?? 50 * 1024 * 1024,
      projectStorageLimitBytes:
        parsed.projectStorageLimitBytes ?? 20 * 1024 * 1024,
      singleFileLimitBytes: parsed.singleFileLimitBytes ?? 5 * 1024 * 1024,
      monthlyTokenLimit: parsed.monthlyTokenLimit ?? null,
      monthlyCostLimitCents: parsed.monthlyCostLimitCents ?? null,
      monthlyMessageLimit: parsed.monthlyMessageLimit ?? null,
      monthlyApiRequestLimit: parsed.monthlyApiRequestLimit ?? 100,
      maxMembers: parsed.maxMembers ?? null,
    };
  } catch {
    return {
      storageLimitBytes: 50 * 1024 * 1024,
      projectStorageLimitBytes: 20 * 1024 * 1024,
      singleFileLimitBytes: 5 * 1024 * 1024,
      monthlyTokenLimit: null,
      monthlyCostLimitCents: null,
      monthlyMessageLimit: null,
      monthlyApiRequestLimit: 100,
      maxMembers: null,
    };
  }
}

export async function saveDefaultLimitsAction(limits: DefaultLimits) {
  const admin = await requireAdmin();
  const before = await getDefaultLimitsAction();
  await prisma.settings.upsert({
    where: { key: 'default_organization_limits' },
    update: { value: JSON.stringify(limits) },
    create: {
      key: 'default_organization_limits',
      value: JSON.stringify(limits),
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.defaultLimitsChanged,
    entityType: 'settings',
    entityId: 'default_organization_limits',
    before: before as unknown as Record<string, unknown>,
    after: limits as unknown as Record<string, unknown>,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/limits');
}

export async function saveOrgLimitsAction(
  orgId: string,
  limits: {
    storageLimitMb: number | null;
    projectStorageLimitMb: number | null;
    singleFileLimitMb: number | null;
    monthlyTokenLimit: number | null;
    monthlyCostLimitCents: number | null;
    monthlyMessageLimit: number | null;
    monthlyApiRequestLimit: number | null;
    maxMembers: number | null;
  },
): Promise<import('@/lib/litellm').LiteLLMSyncResult> {
  const admin = await requireAdmin();
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }
  const toBigIntBytes = (mb: number | null): bigint | null => {
    if (mb === null || !Number.isFinite(mb)) {
      return null;
    }
    return BigInt(Math.floor(mb)) * BigInt(1024 * 1024);
  };

  const toBigInt = (val: number | null): bigint | null => {
    if (val === null || !Number.isFinite(val)) {
      return null;
    }
    return BigInt(Math.floor(val));
  };

  const data: Record<string, unknown> = {};
  data.storageLimitBytes = toBigIntBytes(limits.storageLimitMb);
  data.projectStorageLimitBytes = toBigIntBytes(limits.projectStorageLimitMb);
  data.singleFileLimitBytes = toBigIntBytes(limits.singleFileLimitMb);
  data.monthlyTokenLimit = toBigInt(limits.monthlyTokenLimit);
  data.monthlyCostLimitCents = Number.isFinite(limits.monthlyCostLimitCents)
    ? limits.monthlyCostLimitCents
    : null;
  data.monthlyMessageLimit = Number.isFinite(limits.monthlyMessageLimit)
    ? limits.monthlyMessageLimit
    : null;
  data.monthlyApiRequestLimit = Number.isFinite(limits.monthlyApiRequestLimit)
    ? limits.monthlyApiRequestLimit
    : null;
  data.maxMembers = Number.isFinite(limits.maxMembers)
    ? limits.maxMembers
    : null;

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: data,
    create: { organizationId: orgId, ...data },
  });

  const sync = await syncOrgToLiteLLM(orgId, {
    maxBudget:
      limits.monthlyCostLimitCents != null
        ? limits.monthlyCostLimitCents / 100
        : null,
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgLimitsChanged,
    entityType: 'organization_settings',
    entityId: orgId,
    organizationId: orgId,
    after: {
      ...(limits as unknown as Record<string, unknown>),
      // Recorded so the trail says whether the proxy actually took the ceiling,
      // rather than only that the database did.
      litellmSync: sync,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/limits');
  revalidatePath(`/organizations/${orgId}`);

  return sync;
}
