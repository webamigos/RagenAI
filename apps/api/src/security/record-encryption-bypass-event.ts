import { Logger } from '@nestjs/common';
import { type PrismaService } from '../prisma/prisma.service.js';

/**
 * Records the one-time security event for an `ALLOW_UNENCRYPTED=1` boot —
 * see `docs/thread-encryption.md`. Called once from `main.ts`'s `bootstrap()`,
 * not from a request path, so this is a plain fire-and-forget-safe write
 * rather than the full scrub/escalate pipeline apps/web's
 * `recordSecurityEventCommand` runs for per-request events.
 */
export async function recordEncryptionBypassEvent(
  prisma: PrismaService,
): Promise<void> {
  const logger = new Logger('EncryptionRequirement');
  logger.warn(
    'ALLOW_UNENCRYPTED=1 — starting without message/document encryption in a deployed environment.',
  );

  try {
    await prisma.client.securityEvent.create({
      data: {
        eventType: 'ENCRYPTION_REQUIREMENT_BYPASSED',
        severity: 'critical',
        source: 'infra',
        metadata: { targetEnv: process.env.TARGET_ENV ?? null },
      },
    });
  } catch (err) {
    logger.error('Failed to record encryption-bypass security event', err);
  }
}
