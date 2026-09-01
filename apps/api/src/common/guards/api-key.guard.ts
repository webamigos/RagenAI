import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { ApiKeysService } from '../services/api-keys.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type ApiKey, type KeyId } from '../types/brand.js';
import { type OrgId, type UserId, type ProjectId } from '../types/brand.js';
import { API_CONTEXT_KEY, type ApiContext } from '../types/api-context.js';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const apiKeyHeader = authHeader.slice(BEARER_PREFIX.length) as ApiKey;

    if (!apiKeyHeader) {
      throw new UnauthorizedException('Missing API key');
    }

    let keyId: string;
    try {
      const parsed = this.apiKeysService.parseApiKey(apiKeyHeader);
      keyId = parsed.keyId;
    } catch {
      throw new UnauthorizedException('Invalid API key');
    }

    // DB lookup: get org, project, status

    const dbKey = await this.prisma.client.apiKey.findUnique({
      where: { id: keyId },
      select: {
        isActive: true,
        organizationId: true,
        projectId: true,
        createdBy: true,
        debugMode: true,
      },
    });

    if (!dbKey || !dbKey.organizationId || !dbKey.createdBy) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!dbKey.isActive) {
      throw new ForbiddenException('API key is deactivated');
    }

    // Validate secret against vault
    const isValid = await this.apiKeysService.validate(
      apiKeyHeader,
      keyId as KeyId,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    const apiContext: ApiContext = {
      orgId: dbKey.organizationId as OrgId,
      userId: dbKey.createdBy as UserId,
      ...(dbKey.projectId ? { projectId: dbKey.projectId as ProjectId } : {}),
      keyId: keyId as KeyId,
      debugMode: dbKey.debugMode,
    };

    (request as unknown as Record<string, unknown>)[API_CONTEXT_KEY] =
      apiContext;

    // Fire-and-forget: update lastUsedAt

    this.prisma.client.apiKey
      .update({
        where: { id: keyId },
        data: { lastUsedAt: new Date() },
      })
      .catch((error: unknown) => {
        this.logger.error('Failed to update API key lastUsedAt', error);
      });

    return true;
  }
}
