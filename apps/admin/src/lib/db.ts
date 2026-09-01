// The client is generated into apps/web by the root prisma/schema.prisma's
// first `generator` block (ADR-29 moved that app; the output path moved with
// it). apps/api has its own block and its own copy.
import { PrismaClient } from '../../../web/src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type PrismaClientSingleton = PrismaClient;

const globalForPrisma = globalThis as unknown as {
  prismaAdmin: PrismaClientSingleton | undefined;
};

/**
 * Built on first use, not on import.
 *
 * `next build` executes route modules to collect page data, so a throw at
 * module scope makes the build depend on a database URL it never connects to —
 * which is exactly how Admin / Build failed the first time it ran in CI. The
 * check still happens, just at the point where the value is actually needed.
 */
function createClient(): PrismaClientSingleton {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL environment variable');
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

function getClient(): PrismaClientSingleton {
  if (!globalForPrisma.prismaAdmin) {
    const client = createClient();
    if (process.env['NODE_ENV'] !== 'production') {
      globalForPrisma.prismaAdmin = client;
    }
    return client;
  }
  return globalForPrisma.prismaAdmin;
}

/**
 * Proxied so every call site keeps using `prisma.x.y()` unchanged while the
 * client itself is constructed on the first property access.
 */
export const prisma = new Proxy({} as PrismaClientSingleton, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
