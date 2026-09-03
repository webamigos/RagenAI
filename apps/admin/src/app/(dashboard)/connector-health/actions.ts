'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getVaultClient, isVaultConfigured } from '@/lib/vault';
import { revalidatePath } from 'next/cache';

/**
 * Forcing a connector to be set up again.
 *
 * There is no "repair" a platform administrator can perform: the fault is
 * either at the provider, or in a credential only the connector's own user
 * can re-grant. What the panel can do is clear the broken state so the user
 * is asked to connect again — which is what "inspect a failing connector"
 * ends in when the connector is genuinely dead.
 *
 * ## Ordering, and why it is stricter than apps/api's
 *
 * `disconnectConnector` in apps/api deletes the vault token, **swallows any
 * error**, then deletes the row. That is defensible for a user disconnecting
 * their own integration — they want it gone from the UI either way.
 *
 * It is not defensible here. An administrator forcing a disconnect is usually
 * doing it because the credential is suspect, and a live OAuth token for
 * somebody's Slack or Google account is not something to leave behind while
 * reporting success. Nothing in Ragen could reach it afterwards — no row means
 * no connector means no MCP client — but it would still be a credential we
 * said we removed and did not.
 *
 * So: delete the token first, awaited; only then delete the row. A vault
 * failure leaves both in place and says so, and the administrator can retry.
 *
 * The exception is a 404, which is treated as success. A connector whose token
 * has already been deleted must still be removable, or the one state that most
 * needs clearing would be the one state that cannot be.
 */

export type ForceDisconnectOutcome =
  { ok: true; tokenWasAlreadyGone: boolean } | { ok: false; reason: string };

/** The vault answers a missing token with 404; the client turns that into a message. */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && /\breturned 404\b/.test(error.message);
}

export async function forceDisconnectConnectorAction(
  connectorId: string,
): Promise<ForceDisconnectOutcome> {
  const admin = await requireAdmin();

  const connector = await prisma.mcpConnector.findUnique({
    where: { id: connectorId },
    select: {
      id: true,
      provider: true,
      customerId: true,
      organizationId: true,
      userId: true,
      status: true,
      lastError: true,
    },
  });

  if (!connector) {
    return { ok: false, reason: 'Connector not found' };
  }

  if (!isVaultConfigured()) {
    return {
      ok: false,
      reason:
        'Disconnecting needs RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET on the admin app — the credential lives in the vault, not in Postgres.',
    };
  }

  let tokenWasAlreadyGone = false;
  try {
    await getVaultClient().deleteToken(
      connector.customerId,
      connector.provider,
    );
  } catch (error) {
    if (isNotFound(error)) {
      // Already gone. Removing the row is exactly what is left to do.
      tokenWasAlreadyGone = true;
    } else {
      logger.error(
        { err: error, connectorId, provider: connector.provider },
        'Failed to delete connector token from the vault',
      );
      return {
        ok: false,
        reason: `The credential could not be deleted from the vault, so the connector was left alone: ${
          error instanceof Error ? error.message : String(error)
        }. Retrying is safe.`,
      };
    }
  }

  await prisma.mcpConnector.delete({ where: { id: connector.id } });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.connectorForceDisconnected,
    entityType: 'connector',
    entityId: connector.id,
    organizationId: connector.organizationId,
    before: {
      provider: connector.provider,
      userId: connector.userId,
      status: connector.status,
      lastError: connector.lastError,
    },
    after: { deleted: true, tokenWasAlreadyGone },
    // A credential was destroyed on somebody else's behalf. That belongs in
    // the security view, not only in the organization's audit log.
    securityEvent: { eventType: 'ADMIN_USER_ACTION', severity: 'warn' },
  });

  revalidatePath('/connector-health');
  revalidatePath(`/organizations/${connector.organizationId}`);

  return { ok: true, tokenWasAlreadyGone };
}
