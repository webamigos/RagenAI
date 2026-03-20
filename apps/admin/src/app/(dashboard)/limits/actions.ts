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
  data.maxMembers = Number.isFinite(limits.maxMembers)
    ? limits.maxMembers
    : null;

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: data,
    create: { organizationId: orgId, ...data },
  });

  revalidatePath('/limits');
  revalidatePath(`/organizations/${orgId}`);
}
