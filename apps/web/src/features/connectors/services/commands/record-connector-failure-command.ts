import { McpConnectorStatus } from '@/generated/prisma/client';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import db from '@ragenai/prisma-client';

/**
 * Mark a connector as broken, and say why.
 *
 * ## The gap this closes
 *
 * `McpConnectorStatus.ERROR` existed from the day the model was written and
 * **nothing ever wrote it**. Two failure paths both discarded what they knew:
 *
 * - the OAuth callback redirected with `?status=error` and left the row alone;
 * - the chat path logged `Failed to initialize MCP connector, skipping` and
 *   carried on.
 *
 * The second is the one that matters in practice. A connector whose token has
 * expired or whose MCP server is down keeps `status: CONNECTED`, the user's
 * settings page keeps showing a healthy connector, and their assistant simply
 * stops having those tools — with nothing anywhere saying so. Support could
 * not answer "why did Slack stop working" from the database at all.
 *
 * `MCP_OAUTH_FAILED` had the same shape of gap: in the enum, given a Polish
 * label in `security-alert-email.tsx`, and never emitted.
 *
 * ## Why the write is conditional
 *
 * This runs inside chat request handling, once per broken connector per
 * message. An unconditional `update` would rewrite the same row on every
 * message for as long as the fault lasts — write amplification proportional
 * to traffic, on a fault that is not changing. The `updateMany` below matches
 * only when the stored state actually differs, so a persistent failure costs
 * one write, not one per message.
 *
 * ## Why it never throws
 *
 * The caller is a chat request that is already degraded. Failing to record a
 * connector fault must not also fail the user's message, so everything here
 * is best-effort and logged. This is the one place in the phase-3 work where
 * swallowing is right, and it is swallowing a diagnostic rather than the
 * operation itself.
 */

/**
 * Long reasons are truncated rather than stored whole. Some MCP servers answer
 * a failed handshake with an HTML error page, and the column is what the panel
 * renders in a table cell.
 */
const MAX_REASON_LENGTH = 500;

export type ConnectorFailureSource = 'oauth_callback' | 'runtime_init';

type RecordConnectorFailureInput = {
  organizationId: string;
  userId: string;
  provider: McpConnectorProvider;
  /** Used only when the row does not exist yet — a first connect that failed. */
  mcpServerUrl?: string;
  /** The error as thrown. Normalised and truncated here, not by callers. */
  error: unknown;
  source: ConnectorFailureSource;
};

export function describeConnectorError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const collapsed = message.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_REASON_LENGTH
    ? `${collapsed.slice(0, MAX_REASON_LENGTH - 1)}…`
    : collapsed;
}

/**
 * Whether the failure looks like the user's authorization rather than the
 * remote server being unwell.
 *
 * Only these raise `MCP_OAUTH_FAILED`. A connector failing because its MCP
 * server returned 503 is an outage, and filing it as an OAuth failure would
 * put an infrastructure blip in the bucket somebody searches for credential
 * problems — the same misfiling rule the admin audit trail follows.
 */
export function looksLikeAuthFailure(reason: string): boolean {
  return /\b(401|403|unauthor|unauthentic|forbidden|invalid[_ -]?grant|invalid[_ -]?token|token[_ -]?expired|expired[_ -]?token|access[_ -]?denied)\b/i.test(
    reason,
  );
}

export async function recordConnectorFailureCommand({
  organizationId,
  userId,
  provider,
  mcpServerUrl,
  error,
  source,
}: RecordConnectorFailureInput): Promise<void> {
  const reason = describeConnectorError(error);

  try {
    // Conditional: only when the stored state differs. `updateMany` rather
    // than `update` because it takes a non-unique `where` and returns a count
    // instead of throwing when nothing matches.
    const { count } = await db.mcpConnector.updateMany({
      where: {
        organizationId,
        userId,
        provider,
        OR: [
          { status: { not: McpConnectorStatus.ERROR } },
          { lastError: { not: reason } },
        ],
      },
      data: {
        status: McpConnectorStatus.ERROR,
        lastError: reason,
        lastErrorAt: new Date(),
      },
    });

    if (count === 0) {
      // Either the row is already recorded with this exact fault — the common
      // case on a persistent failure — or there is no row at all. Only the
      // second needs anything, and only when the caller can supply a server
      // URL, since `mcpServerUrl` and `customerId` are required columns.
      const existing = await db.mcpConnector.findUnique({
        where: {
          organizationId_userId_provider: { organizationId, userId, provider },
        },
        select: { id: true },
      });

      if (!existing && mcpServerUrl) {
        await db.mcpConnector.create({
          data: {
            organizationId,
            userId,
            provider,
            mcpServerUrl,
            customerId: `${organizationId}:${userId}:${provider.toLowerCase()}`,
            status: McpConnectorStatus.ERROR,
            lastError: reason,
            lastErrorAt: new Date(),
          },
        });
      } else {
        // Already recorded identically. Nothing to write and nothing to
        // report — returning early also skips a duplicate security event.
        return;
      }
    }

    if (looksLikeAuthFailure(reason)) {
      recordSecurityEvent({
        eventType: 'MCP_OAUTH_FAILED',
        severity: 'warn',
        // `SecurityEventSource` already has an `mcp` bucket for exactly this.
        source: 'mcp',
        organizationId,
        userId,
        metadata: { provider, source, reason },
      });
    }

    logger.warn(
      { provider, organizationId, userId, source, reason },
      'MCP connector marked as failing',
    );
  } catch (writeError) {
    // Best-effort by design: see the note above. The caller is already
    // handling a failure and must not acquire a second one.
    logger.error(
      { err: writeError, provider, organizationId, userId },
      'Failed to record MCP connector failure',
    );
  }
}

/**
 * Clear a recorded fault after a success.
 *
 * Without this the panel fills up with faults that have already healed — an
 * expired token that the user re-authorized, an MCP server that came back —
 * and a stale reason is worse than no reason, because somebody will act on it.
 *
 * Also conditional, and for a stronger reason than write amplification: this
 * runs on the *success* path of every chat message with a working connector,
 * which is the common case. Matching only rows that actually carry a fault
 * keeps the healthy path free of writes entirely.
 */
export async function clearConnectorFailureCommand({
  organizationId,
  userId,
  provider,
}: {
  organizationId: string;
  userId: string;
  provider: McpConnectorProvider;
}): Promise<void> {
  try {
    await db.mcpConnector.updateMany({
      where: {
        organizationId,
        userId,
        provider,
        OR: [
          { status: McpConnectorStatus.ERROR },
          { lastError: { not: null } },
        ],
      },
      data: {
        status: McpConnectorStatus.CONNECTED,
        lastError: null,
        lastErrorAt: null,
      },
    });
  } catch (writeError) {
    logger.error(
      { err: writeError, provider, organizationId, userId },
      'Failed to clear MCP connector failure',
    );
  }
}
