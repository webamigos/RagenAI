import {
  type ExecutionContext,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { McpServiceGuard } from './mcp-service.guard.js';
import { McpOrApiKeyGuard } from './mcp-or-api-key.guard.js';
import { type McpServiceAuthService } from '../services/mcp-service-auth.service.js';
import { type PrismaService } from '../../prisma/prisma.service.js';
import { type ProjectsService } from '../../projects/projects.service.js';
import { type SubscriptionsService } from '../../subscriptions/subscriptions.service.js';
import { type ApiKeyGuard } from './api-key.guard.js';
import { API_CONTEXT_KEY } from '../types/api-context.js';
const identity = {
  userId: 'user-a',
  orgId: 'org-a',
  clientId: 'client-a',
  jti: 'token-a',
  projectId: 'project-a',
};
function setup() {
  const request: { headers: Record<string, string | undefined> } & Record<
    string,
    unknown
  > = {
    headers: {
      authorization: 'Bearer mcp.signed.assertion',
      'x-ragen-team-id': 'forged-team',
    },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  const auth = { verify: vi.fn().mockReturnValue(identity) };
  const member = {
    findFirst: vi
      .fn()
      .mockResolvedValue({ user: { banned: false, banExpires: null } }),
  };
  const activity = { upsert: vi.fn().mockResolvedValue({}) };
  const features = { isFeatureEnabled: vi.fn().mockResolvedValue(true) };
  const projects = {
    getEffectiveProjectPermission: vi.fn().mockResolvedValue({ canView: true }),
  };
  const guard = new McpServiceGuard(
    auth as unknown as McpServiceAuthService,
    {
      client: { member, mcpGrantActivity: activity },
    } as unknown as PrismaService,
    features as unknown as SubscriptionsService,
    projects as unknown as ProjectsService,
  );
  return {
    request,
    context,
    auth,
    member,
    features,
    projects,
    guard,
    activity,
  };
}
describe('McpServiceGuard', () => {
  it('logs the verified token id without forwarding credentials into logs', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    try {
      const s = setup();
      await s.guard.canActivate(s.context);
      expect(log).toHaveBeenCalledWith({
        event: 'mcp.service.assertion.verified',
        jti: 'token-a',
        userId: 'user-a',
        orgId: 'org-a',
        clientId: 'client-a',
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        s.request.headers.authorization,
      );
    } finally {
      log.mockRestore();
    }
  });
  it('does not record activity for a refused connection', async () => {
    const s = setup();
    s.features.isFeatureEnabled.mockResolvedValue(false);
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(s.activity.upsert).not.toHaveBeenCalled();
  });
  it('builds a constrained OAuth context after checking the live member, flag and assistant permission', async () => {
    const s = setup();
    await expect(s.guard.canActivate(s.context)).resolves.toBe(true);
    expect(s.member.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', userId: 'user-a' },
      include: { user: true },
    });
    expect(s.features.isFeatureEnabled).toHaveBeenCalledWith(
      'org-a',
      'mcpOAuth',
    );
    expect(s.projects.getEffectiveProjectPermission).toHaveBeenCalledWith(
      'project-a',
      'org-a',
      'user-a',
    );
    expect(s.activity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clientId: { userId: 'user-a', clientId: 'client-a' } },
        update: {
          organizationId: 'org-a',
          lastUsedAt: expect.any(Date) as Date,
        },
      }),
    );
    expect(s.request[API_CONTEXT_KEY]).toEqual({
      orgId: 'org-a',
      userId: 'user-a',
      projectId: 'project-a',
      knowledgeScope: 'ASSISTANT',
      credential: { type: 'oauth', id: 'client-a:user-a' },
      debugMode: false,
    });
  });
  it('keeps org-wide grants unbound but still validates the live membership', async () => {
    const s = setup();
    s.auth.verify.mockReturnValue({ ...identity, projectId: undefined } as any);
    await s.guard.canActivate(s.context);
    expect(s.projects.getEffectiveProjectPermission).not.toHaveBeenCalled();
    expect(s.request[API_CONTEXT_KEY]).not.toHaveProperty('knowledgeScope');
    expect(s.request[API_CONTEXT_KEY]).not.toHaveProperty('teamId');
  });
  it.each([
    undefined,
    'Bearer sk-key',
    'Bearer ordinary.jwt',
    'mcp.signed.assertion',
  ])(
    'refuses other credentials before querying membership: %s',
    async (header) => {
      const s = setup();
      s.request.headers.authorization = header;
      await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(s.member.findFirst).not.toHaveBeenCalled();
    },
  );
  it('refuses a bad or expired assertion before querying membership', async () => {
    const s = setup();
    s.auth.verify.mockReturnValue(null as any);
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(s.member.findFirst).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { user: { banned: true, banExpires: null } },
    { user: { banned: true, banExpires: new Date(Date.now() + 60_000) } },
  ])('refuses removed or banned members: %j', async (member) => {
    const s = setup();
    s.member.findFirst.mockResolvedValue(member as any);
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(s.request).not.toHaveProperty(API_CONTEXT_KEY);
  });
  it('accepts an expired temporary ban', async () => {
    const s = setup();
    s.member.findFirst.mockResolvedValue({
      user: { banned: true, banExpires: new Date(0) },
    } as any);
    await expect(s.guard.canActivate(s.context)).resolves.toBe(true);
  });
  it('refuses a disabled organization flag and a project the member cannot view', async () => {
    const s = setup();
    s.features.isFeatureEnabled.mockResolvedValue(false);
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    s.features.isFeatureEnabled.mockResolvedValue(true);
    s.projects.getEffectiveProjectPermission.mockResolvedValue({
      canView: false,
    });
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(s.request).not.toHaveProperty(API_CONTEXT_KEY);
  });
});
describe('McpOrApiKeyGuard', () => {
  it('routes by namespace and never falls back after a failed assertion', async () => {
    const s = setup();
    const key = { canActivate: vi.fn().mockResolvedValue(true) };
    const mcp = {
      canActivate: vi.fn().mockRejectedValue(new UnauthorizedException()),
    };
    const guard = new McpOrApiKeyGuard(
      key as unknown as ApiKeyGuard,
      mcp as unknown as McpServiceGuard,
    );
    await expect(guard.canActivate(s.context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(key.canActivate).not.toHaveBeenCalled();
    s.request.headers.authorization = 'Bearer sk-key';
    await expect(guard.canActivate(s.context)).resolves.toBe(true);
    expect(key.canActivate).toHaveBeenCalledOnce();
  });
});
