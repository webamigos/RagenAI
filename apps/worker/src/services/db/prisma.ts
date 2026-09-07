import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../../generated/prisma';
import { logger } from '../logger';
import { createTenantScopeWarnExtension } from './tenant-scope-guard';

/**
 * The worker's Prisma client (ADR-40).
 *
 * Construction follows `apps/api/src/prisma/prisma.service.ts`: a `PrismaPg`
 * adapter over `DATABASE_URL`, then the tenant-scope guard extension with this
 * app's own logger injected. The model map stays in
 * `@ragenai/platform-contracts` — this is the third binding of it, which is
 * the shape ADR-33 intends.
 *
 * Nothing uses this yet. It ships ahead of the migration on purpose: ADR-40's
 * step 1 is the client and the image, separately from any query depending on
 * them, because the Dockerfile is where this can fail in a way local
 * development cannot reproduce.
 *
 * Lazy on purpose. A module-level `new PrismaClient()` would open a pool when
 * anything in `services/db` is imported — including from a Jest test that only
 * wanted a type — and the worker's activities are imported by the workflow
 * bundler too. `getPrisma()` builds it once, on first use.
 */

export type WorkerPrismaClient = ReturnType<typeof buildClient>;

function buildClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter }).$extends(
    createTenantScopeWarnExtension(({ model, operation }) =>
      logger.warn(
        { model, operation },
        'tenant-scope-guard: query is missing its org filter',
      ),
    ),
  );
}

let client: WorkerPrismaClient | undefined;

export function getPrisma(): WorkerPrismaClient {
  if (client === undefined) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      // The knex connection reads the same variable and fails at query time
      // instead, which is a worse place to find out.
      throw new Error(
        'DATABASE_URL is not set — the worker cannot reach the database',
      );
    }

    client = buildClient(connectionString);
  }

  return client;
}

/** For the worker's shutdown path, once anything actually uses the client. */
export async function disconnectPrisma(): Promise<void> {
  if (client !== undefined) {
    await client.$disconnect();
    client = undefined;
  }
}
