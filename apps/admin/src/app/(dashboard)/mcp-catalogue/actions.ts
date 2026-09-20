'use server';

import {
  isMcpAuthType,
  type McpCatalogEntryDto,
} from '@ragenai/platform-contracts';

import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

import {
  toCatalogueEntryView,
  type CatalogueEntryView,
  type OrganizationAllowlist,
} from './catalogue-view';

const DEFAULT_ALLOWED_CONNECTORS_KEY = 'default_allowed_connectors';

const CATALOG_SELECT = {
  publicId: true,
  slug: true,
  label: true,
  description: true,
  icon: true,
  lucideIcon: true,
  mcpServerUrl: true,
  authType: true,
  authBaseUrl: true,
  authPath: true,
  scopes: true,
  useUserScope: true,
  oauthCredentialsStored: true,
  systemPrompt: true,
  allowsPrivateAddress: true,
  isBuiltIn: true,
  enabled: true,
} as const;

/**
 * The thin per-app binding that loads catalogue rows — the same split
 * `tenant-scope` uses, because `@ragenai/platform-contracts` ships to the
 * browser and cannot carry a Prisma query.
 */
export async function listCatalogueEntriesAction(): Promise<
  CatalogueEntryView[]
> {
  await requireAdmin();

  const [rows, organizations, defaults] = await Promise.all([
    prisma.mcpCatalogEntry.findMany({
      select: CATALOG_SELECT,
      orderBy: { id: 'asc' },
    }),
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        settings: { select: { allowedConnectors: true } },
      },
      orderBy: { name: 'asc' },
    }),
    getDefaultAllowedConnectors(),
  ]);

  const allowlists: OrganizationAllowlist[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    allowedConnectors: org.settings?.allowedConnectors ?? [],
  }));

  return rows
    .filter(
      (row): row is typeof row & { authType: McpCatalogEntryDto['authType'] } =>
        // A row whose auth shape this build has no member for is left out rather
        // than rendered under a guess. Three services deploy independently, so a
        // newer member can reach the column before this one knows it.
        isMcpAuthType(row.authType),
    )
    .map((row) => toCatalogueEntryView(row, defaults, allowlists));
}

async function getDefaultAllowedConnectors(): Promise<string[]> {
  const row = await prisma.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_CONNECTORS_KEY },
  });

  if (!row) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
