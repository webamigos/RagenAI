import {
  isMcpAuthType,
  type McpCatalogEntryDto,
} from '@ragenai/platform-contracts';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

/**
 * The thin per-app binding that loads catalogue rows.
 *
 * It lives here rather than in `@ragenai/platform-contracts` because that
 * package is imported by `'use client'` components and policed by
 * `client-bundles-stay-browser-safe.test.ts`, so a Prisma query cannot live
 * there. The contracts hold the DTO and the resolver; this holds the `select`.
 *
 * Nothing calls it yet — Phase B moves the reads onto it.
 */
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

type CatalogRow = {
  [K in keyof typeof CATALOG_SELECT]: K extends 'authType'
    ? string
    : McpCatalogEntryDto[K & keyof McpCatalogEntryDto];
};

/**
 * A row whose `auth_type` this build has no member for is dropped rather than
 * coerced. That is the hazard in
 * `docs/lessons/adding-an-enum-value-breaks-older-readers.md` seen from the
 * reading side: three services deploy independently, so a newer member can
 * reach the column before this client knows it. Dropping means the connector
 * is not offered; guessing would mean dialling a server under the wrong auth
 * shape.
 */
export function toCatalogEntryDto(row: CatalogRow): McpCatalogEntryDto | null {
  if (!isMcpAuthType(row.authType)) {
    logger.warn(
      { slug: row.slug, authType: row.authType },
      'Catalogue entry has an auth type this build does not know; skipping it',
    );
    return null;
  }

  return { ...row, authType: row.authType };
}

export const getCatalogEntriesQuery = async (
  options: { includeDisabled?: boolean } = {},
): Promise<McpCatalogEntryDto[]> => {
  const rows = await db.mcpCatalogEntry.findMany({
    where: options.includeDisabled ? {} : { enabled: true },
    select: CATALOG_SELECT,
    orderBy: { id: 'asc' },
  });

  return rows
    .map((row) => toCatalogEntryDto(row))
    .filter((entry): entry is McpCatalogEntryDto => entry !== null);
};

export const getCatalogEntryQuery = async (
  slug: string,
): Promise<McpCatalogEntryDto | null> => {
  const row = await db.mcpCatalogEntry.findUnique({
    where: { slug },
    select: CATALOG_SELECT,
  });

  return row ? toCatalogEntryDto(row) : null;
};
