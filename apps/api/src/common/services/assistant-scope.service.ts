import { ForbiddenException, Injectable } from '@nestjs/common';
import { scopeRequiresProject } from '@ragenai/platform-contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type ApiContext } from '../types/api-context.js';
import { stripPrefix } from '../utils/openai-format.js';

/**
 * Which assistant a request runs against, and whether the caller's key is
 * allowed to ask for it.
 *
 * One resolver for every endpoint that names an assistant, because the key's
 * scope is a **boundary, not a default**: a key issued for one assistant is
 * refused for another rather than obliged. A second implementation of this
 * rule is a second answer to "what may this key read", and the endpoints that
 * kept their own copy are exactly the ones that disagreed —
 * `/v1/chat/completions` answered 404 for a foreign assistant, `/v1/threads`
 * answered 400, and neither checked the key's own scope at all.
 *
 * Every rejection is a 403 with the same shape. A 404 would distinguish "no
 * such assistant" from "not yours", which is a probe.
 */
@Injectable()
export class AssistantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @returns the project to run against — `null` means the knowledge base
   * (`metadata.project_id IS NULL`), which is a scope, not a missing value.
   */
  async resolve(
    assistantId: string | undefined,
    context: ApiContext,
  ): Promise<string | null> {
    const scope = context.knowledgeScope;

    // No scope means no API key: `SessionAuthService` builds this context for
    // internal, session-authenticated callers. There is no key boundary to
    // enforce, so this is the pre-existing behaviour — the body wins, the org
    // is still checked.
    if (!scope) {
      if (!assistantId) {
        return context.projectId ?? null;
      }
      return this.assertProjectInOrg(assistantId, context);
    }

    if (scope === 'MODEL_ONLY') {
      // Not offered at key creation; a row could still say it, and answering
      // from the knowledge base would be the opposite of what it promises.
      throw new ForbiddenException(
        'This API key is scoped to MODEL_ONLY, which the API does not serve yet',
      );
    }

    if (!scopeRequiresProject(scope)) {
      if (assistantId) {
        throw new ForbiddenException(
          `This API key is scoped to the knowledge base and cannot answer for assistant '${assistantId}'`,
        );
      }
      return null;
    }

    // ASSISTANT from here. The project can have gone away without anyone
    // writing the row — `ApiKey.project` is `onDelete: SetNull` — and the
    // contract is explicit that this fails closed rather than widening to the
    // knowledge base.
    if (!context.projectId) {
      throw new ForbiddenException(
        'The assistant this API key was issued for no longer exists',
      );
    }

    if (assistantId && stripPrefix(assistantId, 'asst') !== context.projectId) {
      throw new ForbiddenException(
        `This API key is scoped to a different assistant than '${assistantId}'`,
      );
    }

    return context.projectId;
  }

  /**
   * The boundary as it applies to *managing* assistants rather than answering
   * from one: `/v1/assistants` and `/v1/files`.
   *
   * Deliberately narrower than `resolve`. A key bound to one assistant may
   * only see and touch that one — without this, "scoped to assistant A" still
   * let the holder list, rename and delete B and C, which is the whole reason
   * the scope is a boundary instead of a default. A knowledge-base key is left
   * alone: its scope says which documents it answers from, and assistant
   * administration is not retrieval. Restricting that too would break
   * `client.assistants.list()` for the default scope and buy nothing the
   * organization boundary does not already give.
   *
   * @returns the project id this key is confined to, or `null` for no
   * confinement beyond the organization.
   */
  confinedToProject(context: ApiContext): string | null {
    if (context.knowledgeScope !== 'ASSISTANT') {
      return null;
    }
    if (!context.projectId) {
      throw new ForbiddenException(
        'The assistant this API key was issued for no longer exists',
      );
    }
    return context.projectId;
  }

  /** Throws unless `rawProjectId` is one this key may manage. */
  assertMayManage(rawProjectId: string, context: ApiContext): void {
    const confined = this.confinedToProject(context);
    if (confined && rawProjectId !== confined) {
      throw new ForbiddenException(
        'This API key is scoped to a different assistant',
      );
    }
  }

  private async assertProjectInOrg(
    assistantId: string,
    context: ApiContext,
  ): Promise<string> {
    const rawProjectId = stripPrefix(assistantId, 'asst');
    const project = await this.prisma.client.project.findFirst({
      where: { id: rawProjectId, organizationId: context.orgId },
      select: { id: true },
    });
    if (!project) {
      throw new ForbiddenException(
        `assistant_id '${assistantId}' is not available to this caller`,
      );
    }
    return project.id;
  }
}
