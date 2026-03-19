import { PrismaClient } from '../../../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prismaClientSingleton = () => {
  return new PrismaClient({ adapter });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prismaAdmin: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prismaAdmin ?? prismaClientSingleton();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prismaAdmin = prisma;
}
