'use server';

import {
  catalogueCredentialsAddress,
  isMcpAuthType,
  type McpAuthType,
  type McpCatalogEntryDto,
} from '@ragenai/platform-contracts';
import { revalidatePath } from 'next/cache';

import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { getVaultClient, isVaultConfigured } from '@/lib/vault';

import { probeMcpServer } from '@ragenai/connector-guard';

import {
  serverUrlFailure,
  validateEntry,
  type CatalogueEntryInput,
} from './validation';

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

export type CatalogueWriteResult = {
  ok: boolean;
  message?: string;
  field?: keyof CatalogueEntryInput;
};

/**
 * Create an entry. This is the feature: a platform administrator adds Notion
 * and it is connectable, with no migration, no release and no deploy.
 */
export async function createCatalogueEntryAction(
  input: CatalogueEntryInput,
): Promise<CatalogueWriteResult> {
  const admin = await requireAdmin();

  const failure = validateEntry(input, { isNew: true });
  if (failure) {
    return { ok: false, field: failure.field, message: failure.message };
  }

  const slug = input.slug.trim();

  // Case-insensitively, because `customerId` is
  // `{orgId}:{userId}:{slug.toLowerCase()}`: a slug `slack` beside the
  // built-in `SLACK` would send both connectors the same `x-customer-id`.
  // The database carries a `lower(slug)` unique index as well; this is the
  // message, that is the guarantee.
  const clash = await prisma.mcpCatalogEntry.findFirst({
    where: { slug: { equals: slug, mode: 'insensitive' } },
    select: { slug: true },
  });
  if (clash) {
    return {
      ok: false,
      field: 'slug',
      message:
        clash.slug === slug
          ? 'That slug is already in the catalogue.'
          : `That slug differs only in case from “${clash.slug}”, and the two would share one customer id.`,
    };
  }

  const entry = await prisma.mcpCatalogEntry.create({
    data: {
      slug,
      label: input.label.trim(),
      description: input.description.trim() || null,
      icon: input.icon.trim() || null,
      lucideIcon: input.lucideIcon.trim() || 'plug',
      mcpServerUrl: input.mcpServerUrl.trim(),
      authType: input.authType as McpAuthType,
      systemPrompt: input.systemPrompt.trim() || null,
      allowsPrivateAddress: input.allowsPrivateAddress,
      scopes: input.scopes,
      useUserScope: input.useUserScope,
      isBuiltIn: false,
      enabled: true,
      createdBy: admin.id,
    },
    select: { id: true, slug: true, publicId: true },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.catalogueEntryCreated,
    entityType: 'mcp_catalogue_entry',
    entityId: entry.publicId,
    after: {
      slug: entry.slug,
      authType: input.authType,
      mcpServerUrl: input.mcpServerUrl.trim(),
      // Recorded because it widens what the server may dial, which is the
      // one field on this form with a security consequence.
      allowsPrivateAddress: input.allowsPrivateAddress,
    },
  });

  revalidatePath('/mcp-catalogue');
  return { ok: true };
}

/**
 * Edit an entry. The slug is not editable — vault token paths, `customerId`s
 * and every `allowedConnectors` array hold it, and changing it would orphan
 * live credentials rather than rename anything.
 */
export async function updateCatalogueEntryAction(
  publicId: string,
  input: CatalogueEntryInput,
): Promise<CatalogueWriteResult> {
  const admin = await requireAdmin();

  const existing = await prisma.mcpCatalogEntry.findUnique({
    where: { publicId },
    select: {
      id: true,
      slug: true,
      isBuiltIn: true,
      authType: true,
      mcpServerUrl: true,
      allowsPrivateAddress: true,
    },
  });
  if (!existing) {
    return { ok: false, message: 'That entry is no longer in the catalogue.' };
  }
  if (existing.isBuiltIn) {
    return {
      ok: false,
      message:
        'A built-in entry is defined by the code that ships with it. You can disable it, and set which organizations may use it.',
    };
  }

  const failure = validateEntry(input, { isNew: false });
  if (failure) {
    return { ok: false, field: failure.field, message: failure.message };
  }

  await prisma.mcpCatalogEntry.update({
    where: { id: existing.id },
    data: {
      label: input.label.trim(),
      description: input.description.trim() || null,
      icon: input.icon.trim() || null,
      lucideIcon: input.lucideIcon.trim() || 'plug',
      mcpServerUrl: input.mcpServerUrl.trim(),
      authType: input.authType as McpAuthType,
      systemPrompt: input.systemPrompt.trim() || null,
      allowsPrivateAddress: input.allowsPrivateAddress,
      scopes: input.scopes,
      useUserScope: input.useUserScope,
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.catalogueEntryUpdated,
    entityType: 'mcp_catalogue_entry',
    entityId: publicId,
    before: {
      authType: existing.authType,
      mcpServerUrl: existing.mcpServerUrl,
      allowsPrivateAddress: existing.allowsPrivateAddress,
    },
    after: {
      authType: input.authType,
      mcpServerUrl: input.mcpServerUrl.trim(),
      allowsPrivateAddress: input.allowsPrivateAddress,
    },
  });

  revalidatePath('/mcp-catalogue');
  return { ok: true };
}

/**
 * Enable or disable an entry, including a built-in.
 *
 * Disabling is the switch an operator has instead of a feature flag: it hides
 * the entry from the gallery and stops new connections, while existing
 * `McpConnector` rows keep resolving until the turn they are in finishes.
 */
export async function setCatalogueEntryEnabledAction(
  publicId: string,
  enabled: boolean,
): Promise<CatalogueWriteResult> {
  const admin = await requireAdmin();

  const existing = await prisma.mcpCatalogEntry.findUnique({
    where: { publicId },
    select: { id: true, slug: true, enabled: true },
  });
  if (!existing) {
    return { ok: false, message: 'That entry is no longer in the catalogue.' };
  }

  await prisma.mcpCatalogEntry.update({
    where: { id: existing.id },
    data: { enabled },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.catalogueEntryToggled,
    entityType: 'mcp_catalogue_entry',
    entityId: publicId,
    before: { slug: existing.slug, enabled: existing.enabled },
    after: { slug: existing.slug, enabled },
  });

  revalidatePath('/mcp-catalogue');
  return { ok: true };
}

/**
 * Delete an entry — only once nothing holds its slug.
 *
 * "No connectors" is not enough on its own. `allowedConnectors` arrays and
 * vault token paths are keyed by slug too, so a slug reused after a deletion
 * would inherit an old allowlist entry or an old token: the quietest possible
 * way for one operator's server to be handed another's credentials. So this
 * refuses while any connector or OAuth token names the slug, and purges the
 * allowlists in the same transaction as the delete.
 *
 * An entry that cannot be fully purged is disabled instead, which reaches the
 * same place for a user and loses nothing.
 */
export async function deleteCatalogueEntryAction(
  publicId: string,
): Promise<CatalogueWriteResult> {
  const admin = await requireAdmin();

  const existing = await prisma.mcpCatalogEntry.findUnique({
    where: { publicId },
    select: { id: true, slug: true, isBuiltIn: true },
  });
  if (!existing) {
    return { ok: false, message: 'That entry is no longer in the catalogue.' };
  }
  if (existing.isBuiltIn) {
    return {
      ok: false,
      message:
        'A built-in entry ships with Ragen and is re-seeded on every deploy. Disable it instead.',
    };
  }

  const [connectors, tokens] = await Promise.all([
    prisma.mcpConnector.count({ where: { providerSlug: existing.slug } }),
    prisma.mcpOAuthToken.count({ where: { providerSlug: existing.slug } }),
  ]);

  if (connectors > 0 || tokens > 0) {
    return {
      ok: false,
      message:
        connectors > 0
          ? `${connectors} connector${connectors === 1 ? '' : 's'} still use this entry. Disable it instead — that stops new connections and leaves the existing ones working.`
          : 'Credentials are still stored against this entry. Disable it instead, or disconnect the connectors that left them behind.',
    };
  }

  const organizations = await prisma.organizationSettings.findMany({
    where: { allowedConnectors: { has: existing.slug } },
    select: { id: true, allowedConnectors: true },
  });

  await prisma.$transaction([
    ...organizations.map((settings) =>
      prisma.organizationSettings.update({
        where: { id: settings.id },
        data: {
          allowedConnectors: settings.allowedConnectors.filter(
            (slug) => slug !== existing.slug,
          ),
        },
      }),
    ),
    prisma.mcpCatalogEntry.delete({ where: { id: existing.id } }),
  ]);

  await purgeFromPlatformDefaults(existing.slug);

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.catalogueEntryDeleted,
    entityType: 'mcp_catalogue_entry',
    entityId: publicId,
    before: {
      slug: existing.slug,
      allowlistsPurged: organizations.length,
    },
    after: { deleted: true },
  });

  revalidatePath('/mcp-catalogue');
  return { ok: true };
}

/** The platform-wide default allowlist is a JSON array in `Settings`. */
async function purgeFromPlatformDefaults(slug: string): Promise<void> {
  const defaults = await getDefaultAllowedConnectors();
  if (!defaults.includes(slug)) {
    return;
  }

  await prisma.settings.update({
    where: { key: DEFAULT_ALLOWED_CONNECTORS_KEY },
    data: { value: JSON.stringify(defaults.filter((entry) => entry !== slug)) },
  });
}

export type ConnectionTestResult =
  { ok: true; toolNames: string[] } | { ok: false; reason: string };

/**
 * Open an MCP session against a URL the administrator has typed and list its
 * tools.
 *
 * It is the only way to tell a working endpoint from a typo before a customer
 * does, and it is offered rather than required: a server that is temporarily
 * down should not block creating its entry.
 *
 * Audited, like the guardrail policy trial and for the same reason — it is an
 * outbound request from the platform to an address somebody just typed, and
 * this entry is the only record it leaves.
 */
export async function testCatalogueConnectionAction(
  url: string,
  allowsPrivateAddress: boolean,
): Promise<ConnectionTestResult> {
  const admin = await requireAdmin();

  // The same save-time refusal, before anything is dialled: a check offered
  // on a form must not be the one path that reaches an address the form would
  // refuse to store.
  const refusal = serverUrlFailure(url.trim(), allowsPrivateAddress);
  if (refusal) {
    return { ok: false, reason: refusal };
  }

  const result = await probeMcpServer(url.trim(), {
    allowPrivate: allowsPrivateAddress,
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.catalogueConnectionTested,
    entityType: 'mcp_catalogue_entry',
    entityId: url.trim(),
    after: result.ok
      ? { ok: true, tools: result.toolNames.length }
      : { ok: false, reason: result.reason },
  });

  return result;
}

/**
 * Store an entry's OAuth client id and secret.
 *
 * **They go to ragen-token-vault, never to the database** (ADR-32). The row
 * keeps one boolean, which also keeps a client secret out of every `SELECT *`
 * and out of the admin activity feed — whose `stripSensitiveFields` would
 * otherwise be the only thing standing between it and the log.
 *
 * Nothing half-succeeds: the boolean is written only after the vault confirms,
 * so an entry that says its credentials are stored is an entry whose
 * credentials are stored.
 */
export async function storeCatalogueOAuthCredentialsAction(
  publicId: string,
  clientId: string,
  clientSecret: string,
): Promise<CatalogueWriteResult> {
  const admin = await requireAdmin();

  if (clientId.trim().length === 0 || clientSecret.trim().length === 0) {
    return {
      ok: false,
      message: 'Both the client id and the client secret are required.',
    };
  }

  if (!isVaultConfigured()) {
    return {
      ok: false,
      message:
        'Storing credentials needs RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET on the admin app — a client secret is never written to the database.',
    };
  }

  const entry = await prisma.mcpCatalogEntry.findUnique({
    where: { publicId },
    select: { id: true, slug: true, isBuiltIn: true, authType: true },
  });
  if (!entry) {
    return { ok: false, message: 'That entry is no longer in the catalogue.' };
  }
  // The persisted auth type decides, not what the form had selected. The
  // panel hides this control for anything else, but the action is reachable
  // without it — and a secret stored against an entry that never becomes an
  // OAuth one is a credential nothing will ever read and nothing will clear.
  if (entry.authType !== 'EXTERNAL_MCP') {
    return {
      ok: false,
      message:
        'OAuth client credentials belong to an external MCP entry. Save the authentication type first.',
    };
  }
  if (entry.isBuiltIn) {
    return {
      ok: false,
      message:
        'A built-in reads its OAuth credentials from the environment it was deployed with.',
    };
  }

  const address = catalogueCredentialsAddress(entry.slug);
  try {
    await getVaultClient().storeToken(address.customerId, address.provider, {
      // The vault's shape is a token; these rows carry only client
      // information, which is how `saveClientInformation` already stores a
      // dynamically registered client.
      accessToken: '',
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      tokenType: 'ClientCredentials',
    });
  } catch (error) {
    return {
      ok: false,
      message: `The vault did not accept the credentials, so nothing was saved: ${
        error instanceof Error ? error.message : String(error)
      }. Retrying is safe.`,
    };
  }

  await prisma.mcpCatalogEntry.update({
    where: { id: entry.id },
    data: { oauthCredentialsStored: true },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.catalogueCredentialsStored,
    entityType: 'mcp_catalogue_entry',
    entityId: publicId,
    // The slug and the fact, never the values: this feed is exactly what
    // ADR-32 keeps a secret out of.
    after: { slug: entry.slug, oauthCredentialsStored: true },
  });

  revalidatePath('/mcp-catalogue');
  return { ok: true };
}
