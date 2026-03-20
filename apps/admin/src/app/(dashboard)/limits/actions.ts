'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

interface DefaultLimits {
  storageLimitBytes: number | null;
  projectStorageLimitBytes: number | null;
  singleFileLimitBytes: number | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  maxMembers: number | null;
}

export async function getDefaultLimitsAction(): Promise<DefaultLimits> {
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
      maxMembers: null,
    };
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return {
      storageLimitBytes: 50 * 1024 * 1024,
      projectStorageLimitBytes: 20 * 1024 * 1024,
      singleFileLimitBytes: 5 * 1024 * 1024,
      monthlyTokenLimit: null,
      monthlyCostLimitCents: null,
      monthlyMessageLimit: null,
      maxMembers: null,
    };
  }
}

export async function saveDefaultLimitsAction(limits: DefaultLimits) {
  await prisma.settings.upsert({
    where: { key: 'default_organization_limits' },
    update: { value: JSON.stringify(limits) },
    create: {
      key: 'default_organization_limits',
      value: JSON.stringify(limits),
    },
  });

  revalidatePath('/limits');
}

interface OrgLimits {
  storageLimitBytes: bigint | null;
  projectStorageLimitBytes: bigint | null;
  singleFileLimitBytes: bigint | null;
  monthlyTokenLimit: bigint | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  maxMembers: number | null;
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
    maxMembers: number | null;
  },
) {
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }
  const data: Record<string, unknown> = {};

  data.storageLimitBytes =
    limits.storageLimitMb !== null
      ? BigInt(limits.storageLimitMb) * BigInt(1024 * 1024)
      : null;
  data.projectStorageLimitBytes =
    limits.projectStorageLimitMb !== null
      ? BigInt(limits.projectStorageLimitMb) * BigInt(1024 * 1024)
      : null;
  data.singleFileLimitBytes =
    limits.singleFileLimitMb !== null
      ? BigInt(limits.singleFileLimitMb) * BigInt(1024 * 1024)
      : null;
  data.monthlyTokenLimit =
    limits.monthlyTokenLimit !== null ? BigInt(limits.monthlyTokenLimit) : null;
  data.monthlyCostLimitCents = limits.monthlyCostLimitCents;
  data.monthlyMessageLimit = limits.monthlyMessageLimit;
  data.maxMembers = limits.maxMembers;

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: data,
    create: { organizationId: orgId, ...data },
  });

  revalidatePath('/limits');
  revalidatePath(`/organizations/${orgId}`);
}
