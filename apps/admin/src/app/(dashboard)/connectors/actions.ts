'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
const DEFAULT_ALLOWED_CONNECTORS_KEY = 'default_allowed_connectors';

/**
 * Whether every value names a catalogue entry.
 *
 * This used to ask `isConnectorProvider`, the compiled-in list of eleven —
 * which meant a connector a platform administrator had just added could not be
 * granted to any organization: the row existed, the gallery could show it, and
 * this page refused to save it. That is the per-organization restriction the
 * whole spec is for, so the validator asks the catalogue
 * (docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md, C4).
 *
 * Disabled entries are admitted on purpose. Disabling is a switch an operator
 * flips both ways, and an allowlist that silently dropped the slug while it
 * was off would come back different.
 */
async function validateConnectors(connectors: string[]): Promise<boolean> {
  if (!Array.isArray(connectors)) {
    return false;
  }

  const unique = [...new Set(connectors)];
  if (unique.length !== connectors.length) {
    return false;
  }
  if (unique.length === 0) {
    return true;
  }

  const known = await prisma.mcpCatalogEntry.count({
    where: { slug: { in: unique } },
  });
  return known === unique.length;
}

/**
 * The catalogue, as the allowlist forms render it.
 *
 * It replaces `allConnectors` — the eleven compiled-in built-ins — because an
 * entry an operator added has to be grantable, which means it has to appear on
 * this page at all. A disabled entry is listed and marked: it can still be
 * granted, and an operator who disabled it temporarily would otherwise find
 * their allowlist quietly changed when they turned it back on.
 */
export async function listGrantableConnectorsAction(): Promise<
  { value: string; label: string; icon: string | null; enabled: boolean }[]
> {
  await requireAdmin();

  const entries = await prisma.mcpCatalogEntry.findMany({
    select: { slug: true, label: true, icon: true, enabled: true },
    orderBy: { id: 'asc' },
  });

  return entries.map((entry) => ({
    value: entry.slug,
    label: entry.label,
    icon: entry.icon,
    enabled: entry.enabled,
  }));
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
  const admin = await requireAdmin();
  const before = await getDefaultAllowedConnectorsAction();

  if (!(await validateConnectors(connectors))) {
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

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.defaultConnectorsChanged,
    entityType: 'settings',
    entityId: 'default_allowed_connectors',
    before: { connectors: before },
    after: { connectors },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/connectors');
}

export async function saveOrgAllowedConnectorsAction(
  orgId: string,
  connectors: string[],
): Promise<void> {
  const admin = await requireAdmin();

  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }

  if (!(await validateConnectors(connectors))) {
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

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgConnectorsChanged,
    entityType: 'organization_settings',
    entityId: orgId,
    organizationId: orgId,
    after: { allowedConnectors: connectors },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/connectors');
  revalidatePath(`/organizations/${orgId}`);
}
