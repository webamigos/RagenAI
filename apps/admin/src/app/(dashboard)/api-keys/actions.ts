'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  API_KEY_VAULT_PROVIDER,
  apiKeyVaultCustomerId,
  getVaultClient,
  isVaultConfigured,
} from '@/lib/vault';
import { revalidatePath } from 'next/cache';

/**
 * Reviewing and withdrawing an organization's API keys.
 *
 * ## What actually stops a key working
 *
 * `ApiKeyGuard` in apps/api checks three things in order
 * (`apps/api/src/common/guards/api-key.guard.ts`):
 *
 * 1. the `ApiKey` row exists          — missing → 401
 * 2. `isActive`                       — false   → 403
 * 3. the secret matches the vault     — no      → 401
 *
 * So **clearing `isActive` is by itself a complete revocation at the API
 * boundary** — the guard rejects before it ever reaches the vault. That is
 * worth stating because it decides the ordering below: the cheap local write
 * is what makes the key stop working, and the vault call is hygiene, removing
 * a secret nothing can use any more.
 *
 * ## Deactivate and revoke are deliberately separate controls
 *
 * apps/web conflates them: its toggle flips `isActive` and never touches the
 * vault, while its delete removes the row and fires the vault delete
 * **without awaiting it** (`remove-api-key-command.ts`), so a vault error is
 * logged after the row is already gone and nothing records that the secret
 * survived. That orphan is unreachable — the row that named it no longer
 * exists.
 *
 * This panel splits the two, and awaits:
 *
 * - **Deactivate** — reversible. `isActive = false`, vault untouched, so the
 *   same key works again if reactivated. Right for "this looks compromised,
 *   let me check" and for pausing an integration.
 * - **Revoke** — permanent. Deactivate, then delete the secret, then delete
 *   the row, each awaited in that order.
 *
 * The order matters on failure. If the vault delete throws, the key is
 * already deactivated (dead at the guard) and its row still exists, so the
 * administrator sees a key they can retry. The reverse order would delete the
 * row first and lose the only handle on the secret — apps/web's bug.
 *
 * Fixing `removeApiKeyCommand` in apps/web is the obvious follow-up. It is a
 * customer-facing change in failure semantics — a vault outage would start
 * failing a customer's own delete — so it is flagged here rather than
 * smuggled into a commit about the admin panel.
 */

type KeyForAudit = {
  id: string;
  name: string;
  organizationId: string | null;
  maskedValue: string;
  isActive: boolean;
};

async function loadKey(apiKeyId: string): Promise<KeyForAudit> {
  const key = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      maskedValue: true,
      isActive: true,
    },
  });
  if (!key) {
    throw new Error('API key not found');
  }
  return key;
}

/**
 * `ApiKey.organization` is `onDelete: SetNull`, so a key can outlive its
 * organization and carry `organizationId: null`. That is why every action
 * below passes a `securityEvent`: `AuditLog.organizationId` is a required FK,
 * so an orphaned key's entry has no home there and `recordAdminAction` would
 * refuse it outright rather than record nothing.
 */
function auditPaths(organizationId: string | null): void {
  revalidatePath('/api-keys');
  if (organizationId) {
    revalidatePath(`/organizations/${organizationId}`);
  }
}

export async function deactivateApiKeyAction(apiKeyId: string): Promise<void> {
  const admin = await requireAdmin();
  const key = await loadKey(apiKeyId);

  if (!key.isActive) {
    throw new Error('That key is already deactivated.');
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { isActive: false },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.apiKeyDeactivated,
    entityType: 'api-key',
    entityId: key.id,
    organizationId: key.organizationId,
    before: { name: key.name, maskedValue: key.maskedValue, isActive: true },
    after: { isActive: false },
    securityEvent: { eventType: 'API_KEY_REVOKED', severity: 'warn' },
  });

  auditPaths(key.organizationId);
}

export async function reactivateApiKeyAction(apiKeyId: string): Promise<void> {
  const admin = await requireAdmin();
  const key = await loadKey(apiKeyId);

  if (key.isActive) {
    throw new Error('That key is already active.');
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { isActive: true },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.apiKeyReactivated,
    entityType: 'api-key',
    entityId: key.id,
    organizationId: key.organizationId,
    before: { name: key.name, maskedValue: key.maskedValue, isActive: false },
    after: { isActive: true },
    // Not API_KEY_REVOKED: re-enabling a credential is the opposite, and the
    // incidents view filters on this field — a misfiled event is one nobody
    // finds. `ADMIN_SETTINGS_CHANGED` is the configuration bucket, raised to
    // `warn` because a platform administrator re-enabling somebody else's
    // credential is worth surfacing.
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
  });

  auditPaths(key.organizationId);
}

export type RevokeOutcome =
  { ok: true } | { ok: false; reason: string; deactivated: boolean };

/**
 * Returns its failure rather than throwing it, because the two failure modes
 * mean different things to the reader and both need saying: an unconfigured
 * vault means revoking is impossible here at all, while a vault error means
 * the key is already dead but its secret is still stored — retry.
 */
export async function revokeApiKeyAction(
  apiKeyId: string,
): Promise<RevokeOutcome> {
  const admin = await requireAdmin();
  const key = await loadKey(apiKeyId);

  if (!isVaultConfigured()) {
    return {
      ok: false,
      deactivated: false,
      reason:
        'Revoking needs RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET on the admin app. Deactivate stops the key working in the meantime.',
    };
  }

  // Step 1. This is the write that stops the key authenticating; everything
  // after it is cleanup. Skipped when the key is already inactive so the
  // audit trail does not claim a change that did not happen.
  if (key.isActive) {
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { isActive: false },
    });
  }

  // Step 2. Destroy the secret. Awaited: if this fails the row must survive,
  // because the row is the only thing that names the vault entry.
  try {
    await getVaultClient().deleteToken(
      apiKeyVaultCustomerId(key.id),
      API_KEY_VAULT_PROVIDER,
    );
  } catch (error) {
    logger.error(
      { err: error, apiKeyId: key.id },
      'Failed to delete API key secret from the vault',
    );

    await recordAdminAction({
      admin,
      action: ADMIN_ACTIONS.apiKeyRevoked,
      entityType: 'api-key',
      entityId: key.id,
      organizationId: key.organizationId,
      before: { name: key.name, maskedValue: key.maskedValue },
      after: {
        isActive: false,
        vaultSecretDeleted: false,
        rowDeleted: false,
        error: error instanceof Error ? error.message : String(error),
      },
      securityEvent: { eventType: 'API_KEY_REVOKED', severity: 'warn' },
    });

    auditPaths(key.organizationId);

    return {
      ok: false,
      deactivated: true,
      reason: `The key is deactivated and can no longer authenticate, but its secret is still in the vault: ${
        error instanceof Error ? error.message : String(error)
      }. Retrying is safe.`,
    };
  }

  // Step 3. Only now is the row expendable.
  await prisma.apiKey.delete({ where: { id: key.id } });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.apiKeyRevoked,
    entityType: 'api-key',
    entityId: key.id,
    organizationId: key.organizationId,
    before: {
      name: key.name,
      maskedValue: key.maskedValue,
      isActive: key.isActive,
    },
    after: { isActive: false, vaultSecretDeleted: true, rowDeleted: true },
    securityEvent: { eventType: 'API_KEY_REVOKED', severity: 'warn' },
  });

  auditPaths(key.organizationId);

  return { ok: true };
}
