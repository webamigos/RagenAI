import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '@/app/lib/utils/logger';
import {
  createTenantScopeWarnExtension,
  type TenantScopeViolation,
} from './tenant-scope-guard';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

function logTenantScopeViolation({ model, operation }: TenantScopeViolation) {
  logger.warn(
    { model, operation },
    'tenant-scope-guard: query missing org filter',
  );
}

const prismaClientSingleton = () => {
  return new PrismaClient({ adapter }).$extends(
    createTenantScopeWarnExtension(logTenantScopeViolation),
  );
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
