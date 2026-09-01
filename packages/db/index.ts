// The client is generated into apps/web by the root prisma/schema.prisma's
// first `generator` block (ADR-29 moved that app; the output path moved with
// it). apps/api has its own block and its own copy.
import { PrismaClient } from '../../apps/web/src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL environment variable');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prismaClientSingleton = () => {
  return new PrismaClient({ adapter });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
