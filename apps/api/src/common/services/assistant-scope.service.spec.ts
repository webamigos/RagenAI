import { ForbiddenException } from '@nestjs/common';
import { AssistantScopeService } from './assistant-scope.service.js';
import { type PrismaService } from '../../prisma/prisma.service.js';
import { type ApiContext } from '../types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../types/brand.js';

describe('AssistantScopeService', () => {
  const base = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  const assistantKey: ApiContext = {
    ...base,
    knowledgeScope: 'ASSISTANT',
    projectId: 'proj-a' as ProjectId,
  };

  const knowledgeBaseKey: ApiContext = {
    ...base,
    knowledgeScope: 'KNOWLEDGE_BASE',
  };

  function buildService(project: unknown = null) {
    const findFirst = vi.fn().mockResolvedValue(project);
    const prisma = {
      client: { project: { findFirst } },
    } as unknown as PrismaService;
    return { service: new AssistantScopeService(prisma), findFirst };
  }

  describe('a key bound to an assistant', () => {
    it('answers for its own assistant when the body says nothing', async () => {
      const { service, findFirst } = buildService();
      await expect(service.resolve(undefined, assistantKey)).resolves.toBe(
        'proj-a',
      );
      // The key's own project needs no lookup: it was checked when the key
      // was created, and the org owns it.
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('accepts its own assistant named in the body, raw', async () => {
      const { service } = buildService();
      await expect(service.resolve('proj-a', assistantKey)).resolves.toBe(
        'proj-a',
      );
    });

    it('accepts its own assistant named with the asst- prefix', async () => {
      const { service } = buildService();
      await expect(service.resolve('asst-proj-a', assistantKey)).resolves.toBe(
        'proj-a',
      );
    });

    it('refuses another assistant, even one in the same org', async () => {
      const { service } = buildService({ id: 'proj-b' });
      await expect(
        service.resolve('proj-b', assistantKey),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an id that exists nowhere, with the same error as one that does', async () => {
      const { service } = buildService(null);
      await expect(
        service.resolve('nonexistent', assistantKey),
      ).rejects.toThrow(/scoped to a different assistant/);
    });

    // `ApiKey.project` is onDelete: SetNull, so this state arrives without
    // anyone writing the row. It must fail closed, not widen to the
    // knowledge base.
    it('refuses everything once its assistant has been deleted', async () => {
      const { service } = buildService();
      const orphaned: ApiContext = { ...base, knowledgeScope: 'ASSISTANT' };

      await expect(service.resolve(undefined, orphaned)).rejects.toThrow(
        /no longer exists/,
      );
      await expect(service.resolve('proj-a', orphaned)).rejects.toThrow(
        /no longer exists/,
      );
    });
  });

  describe('a key scoped to the knowledge base', () => {
    it('resolves to null — a scope, not a missing value', async () => {
      const { service } = buildService();
      await expect(service.resolve(undefined, knowledgeBaseKey)).resolves.toBe(
        null,
      );
    });

    it('refuses any assistant named in the body', async () => {
      const { service } = buildService({ id: 'proj-a' });
      await expect(service.resolve('proj-a', knowledgeBaseKey)).rejects.toThrow(
        /scoped to the knowledge base/,
      );
    });
  });

  describe('a key scoped to MODEL_ONLY', () => {
    // Key creation refuses this, but a row could still carry it.
    it('is refused rather than served from the knowledge base', async () => {
      const { service } = buildService();
      await expect(
        service.resolve(undefined, { ...base, knowledgeScope: 'MODEL_ONLY' }),
      ).rejects.toThrow(/MODEL_ONLY/);
    });
  });

  describe('a context with no scope at all', () => {
    // SessionAuthService builds one of these for internal callers. There is
    // no key, so there is no boundary — treating the absence as a value would
    // 403 every session-authenticated request.
    const sessionContext: ApiContext = { ...base };

    it('falls back to the context project when the body says nothing', async () => {
      const { service } = buildService();
      await expect(
        service.resolve(undefined, {
          ...sessionContext,
          projectId: 'proj-a' as ProjectId,
        }),
      ).resolves.toBe('proj-a');
    });

    it('resolves to the knowledge base when there is no project either', async () => {
      const { service } = buildService();
      await expect(service.resolve(undefined, sessionContext)).resolves.toBe(
        null,
      );
    });

    it('lets the body name any assistant the org owns', async () => {
      const { service, findFirst } = buildService({ id: 'proj-b' });
      await expect(
        service.resolve('asst-proj-b', sessionContext),
      ).resolves.toBe('proj-b');
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'proj-b', organizationId: 'org-1' },
        select: { id: true },
      });
    });

    it('refuses an assistant the org does not own', async () => {
      const { service } = buildService(null);
      await expect(
        service.resolve('proj-elsewhere', sessionContext),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
