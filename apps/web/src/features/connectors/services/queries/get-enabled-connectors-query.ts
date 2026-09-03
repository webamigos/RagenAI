'use server';

import db from '@ragenai/prisma-client';
import { McpConnectorStatus } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

/**
 * How long a failing connector is left alone before it is tried again.
 *
 * This exists because of a consequence that only appears once something
 * actually writes `status: ERROR`. This query used to select
 * `status: CONNECTED` and nothing else, which was harmless while `ERROR` was
 * never written — but the moment a runtime failure marks a connector, that
 * filter would exclude it from every later request, and it would **never be
 * retried**. A five-minute MCP outage would have disabled the connector until
 * the user noticed and re-authorized by hand.
 *
 * So a failed connector comes back into the pool after this window. The cost
 * of the window is one failing handshake per connector per interval instead of
 * one per message; the cost of not having it is a permanent fault from a
 * transient one.
 */
const RETRY_FAILED_AFTER_MINUTES = 15;

export const getEnabledConnectorsQuery = async (
  organizationId: string,
  userId: string,
) => {
  const retryBefore = new Date(
    Date.now() - RETRY_FAILED_AFTER_MINUTES * 60 * 1000,
  );

  try {
    return await db.mcpConnector.findMany({
      where: {
        organizationId: organizationId,
        userId: userId,
        enabled: true,
        OR: [
          { status: McpConnectorStatus.CONNECTED },
          {
            status: McpConnectorStatus.ERROR,
            // `lastErrorAt: null` is included deliberately. A row marked
            // ERROR with no timestamp — an older row, or a partial write —
            // would otherwise be excluded forever by a date comparison.
            OR: [{ lastErrorAt: null }, { lastErrorAt: { lte: retryBefore } }],
          },
        ],
      },
      select: {
        id: true,
        provider: true,
        mcpServerUrl: true,
        customerId: true,
        organizationId: true,
        userId: true,
        // Carried through so the tool loader knows whether a success is a
        // recovery worth recording. Without it, clearing a fault would mean
        // a write attempt on every healthy connector on every message.
        status: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching enabled connectors');
    throw error;
  }
};
