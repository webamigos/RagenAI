import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { McpServiceAuthService } from '../services/mcp-service-auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service.js';
import { API_CONTEXT_KEY, type ApiContext } from '../types/api-context.js';
import { type OrgId, type UserId, type ProjectId } from '../types/brand.js';

@Injectable()
export class McpServiceGuard implements CanActivate {
  constructor(
    private readonly authentication: McpServiceAuthService,
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly projects: ProjectsService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const assertion = header?.startsWith('Bearer mcp.')
      ? this.authentication.verify(header.slice(7))
      : null;
    if (!assertion) {
      throw new UnauthorizedException(
        'Invalid or expired MCP service assertion',
      );
    }
    const member = await this.prisma.client.member.findFirst({
      where: { organizationId: assertion.orgId, userId: assertion.userId },
      include: { user: true },
    });
    if (
      !member ||
      (member.user.banned &&
        (!member.user.banExpires || member.user.banExpires > new Date())) ||
      !(await this.subscriptions.isFeatureEnabled(assertion.orgId, 'mcpOAuth'))
    ) {
      throw new ForbiddenException('MCP access is unavailable');
    }
    if (
      assertion.projectId &&
      !(
        await this.projects.getEffectiveProjectPermission(
          assertion.projectId,
          assertion.orgId,
          assertion.userId,
        )
      ).canView
    ) {
      throw new ForbiddenException('Assistant is unavailable');
    }
    const lastUsedAt = new Date();
    await this.prisma.client.mcpGrantActivity.upsert({
      where: {
        userId_clientId: {
          userId: assertion.userId,
          clientId: assertion.clientId,
        },
      },
      create: {
        userId: assertion.userId,
        clientId: assertion.clientId,
        organizationId: assertion.orgId,
        lastUsedAt,
      },
      update: { organizationId: assertion.orgId, lastUsedAt },
    });
    const apiContext: ApiContext = {
      orgId: assertion.orgId as OrgId,
      userId: assertion.userId as UserId,
      ...(assertion.projectId
        ? {
            projectId: assertion.projectId as ProjectId,
            knowledgeScope: 'ASSISTANT' as const,
          }
        : {}),
      credential: {
        type: 'oauth',
        id: `${assertion.clientId}:${assertion.userId}`,
      },
      debugMode: false,
    };
    (request as unknown as Record<string, unknown>)[API_CONTEXT_KEY] =
      apiContext;
    return true;
  }
}
