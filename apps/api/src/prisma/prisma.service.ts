import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  createTenantScopeWarnExtension,
  type TenantScopeViolation,
} from './tenant-scope-guard.js';

function buildClient(connectionString: string, logger: Logger) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }).$extends(
    createTenantScopeWarnExtension(
      ({ model, operation }: TenantScopeViolation) =>
        logger.warn(
          `tenant-scope-guard: ${model}.${operation} is missing its org filter`,
        ),
    ),
  );
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: ReturnType<typeof buildClient>;
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URL');

    this.client = buildClient(connectionString, this.logger);
  }

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
