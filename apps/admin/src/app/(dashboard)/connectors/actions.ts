'use server';

import { requireAdmin } from '@/lib/auth-guard';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { isConnectorProvider } from '@ragenai/platform-contracts';
import { allConnectors } from './connectors-config';

const DEFAULT_ALLOWED_CONNECTORS_KEY = 'default_allowed_connectors';

function validateConnectors(connectors: string[]): boolean {
  if (!Array.isArray(connectors)) {
    return false;
  }
  if (connectors.length > allConnectors.length) {
    return false;
  }
  // `isConnectorProvider` is the shared guard, so this cannot drift from the
  // schema enum the values are ultimately compared against.
  return connectors.every(isConnectorProvider);
}

export async function getDefaultAllowedConnectorsAction(): Promise<string[]> {
  await requireAdmin();
  const row = await prisma.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_CONNECTORS_KEY },
  });

  if (!row) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDefaultAllowedConnectorsAction(
  connectors: string[],
): Promise<void> {
  await requireAdmin();

  if (!validateConnectors(connectors)) {
    throw new Error('Invalid connector values');
  }

  await prisma.settings.upsert({
    where: { key: DEFAULT_ALLOWED_CONNECTORS_KEY },
    update: { value: JSON.stringify(connectors) },
    create: {
      key: DEFAULT_ALLOWED_CONNECTORS_KEY,
      value: JSON.stringify(connectors),
    },
  });

  revalidatePath('/connectors');
}

export async function saveOrgAllowedConnectorsAction(
  orgId: string,
  connectors: string[],
): Promise<void> {
  await requireAdmin();

  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }

  if (!validateConnectors(connectors)) {
    throw new Error('Invalid connector values');
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: { allowedConnectors: connectors },
    create: { organizationId: orgId, allowedConnectors: connectors },
  });

  revalidatePath('/connectors');
  revalidatePath(`/organizations/${orgId}`);
}
