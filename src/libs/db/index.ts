import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  // prisma logs are too verbose and nobody reads it even on localhost ;)
  // return new PrismaClient({ log: ['query'] });
  return new PrismaClient();
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
