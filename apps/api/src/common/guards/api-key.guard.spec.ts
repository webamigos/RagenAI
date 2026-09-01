/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method */
jest.mock('../../generated/prisma/client.js', () => ({
  PrismaClient: jest.fn(),
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';
import { type ApiKeysService } from '../services/api-keys.service.js';
import { type PrismaService } from '../../prisma/prisma.service.js';
import { API_CONTEXT_KEY } from '../types/api-context.js';
import { type KeyId } from '../types/brand.js';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeysService: jest.Mocked<ApiKeysService>;
  let prismaService: any;

  const mockDbKey = {
    isActive: true,
    organizationId: 'org_1',
    projectId: 'proj_1',
    createdBy: 'user_1',
    debugMode: false,
  };

  function createMockContext(
    headers: Record<string, string> = {},
  ): ExecutionContext {
    const request: Record<string, any> = { headers };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }

  beforeEach(() => {
    apiKeysService = {
      parseApiKey: jest.fn().mockReturnValue({ keyId: 'key_5' as KeyId }),
      validate: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<ApiKeysService>;

    prismaService = {
      client: {
        apiKey: {
          findUnique: jest.fn().mockResolvedValue(mockDbKey),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    };

    guard = new ApiKeyGuard(apiKeysService, prismaService as PrismaService);
  });

  it('should throw UnauthorizedException when no Authorization header is present', async () => {
    const context = createMockContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when Authorization header has wrong scheme', async () => {
    const context = createMockContext({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should set apiContext from DB lookup and return true with valid key', async () => {
    const context = createMockContext({
      authorization: 'Bearer sk-key_5.secret',
    });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeysService.parseApiKey).toHaveBeenCalledWith('sk-key_5.secret');
    expect(prismaService.client.apiKey.findUnique).toHaveBeenCalledWith({
      where: { id: 'key_5' },
      select: {
        isActive: true,
        organizationId: true,
        projectId: true,
        createdBy: true,
        debugMode: true,
      },
    });
    expect(apiKeysService.validate).toHaveBeenCalledWith(
      'sk-key_5.secret',
      'key_5',
    );

    const request = context.switchToHttp().getRequest();
    expect(request[API_CONTEXT_KEY]).toEqual({
      orgId: 'org_1',
      userId: 'user_1',
      projectId: 'proj_1',
      keyId: 'key_5',
      debugMode: false,
    });
  });

  it('should throw ForbiddenException when key is deactivated', async () => {
    prismaService.client.apiKey.findUnique.mockResolvedValue({
      ...mockDbKey,
      isActive: false,
    });

    const context = createMockContext({
      authorization: 'Bearer sk-key_5.secret',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    // Should not reach vault validation
    expect(apiKeysService.validate).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when key not found in DB', async () => {
    prismaService.client.apiKey.findUnique.mockResolvedValue(null);

    const context = createMockContext({
      authorization: 'Bearer sk-key_5.secret',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when vault validation fails', async () => {
    apiKeysService.validate.mockResolvedValue(false);
    const context = createMockContext({
      authorization: 'Bearer sk-key_5.secret',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when key format is invalid', async () => {
    apiKeysService.parseApiKey.mockImplementation(() => {
      throw new Error('Invalid API key format');
    });
    const context = createMockContext({ authorization: 'Bearer garbage' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should fire-and-forget lastUsedAt update', async () => {
    const context = createMockContext({
      authorization: 'Bearer sk-key_5.secret',
    });
    await guard.canActivate(context);

    expect(prismaService.client.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key_5' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});
