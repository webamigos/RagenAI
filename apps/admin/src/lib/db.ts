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

/**
 * One client per process, cached in a module-level binding.
 *
 * The dev-only global is separate and is only there so Next's hot reload reuses
 * the client across module re-evaluations instead of opening a pool per edit.
 * An earlier version of this file cached *only* on that global, which meant
 * production never cached at all: the proxy below calls this on every property
 * access, so `prisma.user.findFirst()` built a fresh PrismaClient — and a fresh
 * connection pool — every single time.
 */
let client: PrismaClientSingleton | undefined;

function getClient(): PrismaClientSingleton {
  client ??= globalForPrisma.prismaAdmin ?? createClient();

  if (process.env['NODE_ENV'] !== 'production') {
    globalForPrisma.prismaAdmin = client;
  }

  return client;
}

/**
 * Proxied so every call site keeps using `prisma.x.y()` unchanged while the
 * client itself is constructed on first property access — `next build` executes
 * route modules to collect page data, and construction needs DATABASE_URL.
 */
export const prisma = new Proxy({} as PrismaClientSingleton, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
