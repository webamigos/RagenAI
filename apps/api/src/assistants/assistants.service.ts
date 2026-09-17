import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildList,
  stripPrefix,
  type OpenAIListEnvelope,
} from '../common/utils/openai-format.js';
import {
  toOpenAIAssistant,
  type OpenAIAssistant,
  type OrgDefaults,
  type ProjectWithSettings,
} from './assistants.mapper.js';
import { type ApiContext } from '../common/types/api-context.js';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';
import { type CreateAssistantDto } from './dto/create-assistant.dto.js';
import { type UpdateAssistantDto } from './dto/update-assistant.dto.js';
import { type ListAssistantsDto } from './dto/list-assistants.dto.js';

@Injectable()
export class AssistantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistantScope: AssistantScopeService,
  ) {}

  /**
   * List the assistants this key may see.
   *
   * This used to be org-wide for every key, on the reasoning that OpenAI's
   * `client.assistants.list()` should return many entries and that the key's
   * project was "the default project for chat/files, not a visibility
   * boundary across assistants". The second half of that is no longer true:
   * a key is created with a scope, and an `ASSISTANT` scope is a boundary —
   * so a key bound to one assistant lists that one. The first half still
   * holds for a knowledge-base key, which is the default and still sees the
   * whole organization.
   */
  async list(
    context: ApiContext,
    query: ListAssistantsDto,
  ): Promise<OpenAIListEnvelope<OpenAIAssistant>> {
    const limit = query.limit ?? 20;
    const order = query.order ?? 'desc';
    const cursorId = query.after ? stripPrefix(query.after, 'asst') : undefined;

    const confinedTo = this.assistantScope.confinedToProject(context);

    const rows = await this.prisma.client.project.findMany({
      where: {
        organizationId: context.orgId,
        ...(confinedTo ? { id: confinedTo } : {}),
      },
      orderBy: { createdAt: order },
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: this.projectSelect(),
    });

    const orgDefaults = await this.getOrgDefaults(context.orgId);
    return buildList(rows.map((p) => toOpenAIAssistant(p, orgDefaults)));
  }

  async get(id: string, context: ApiContext): Promise<OpenAIAssistant> {
    this.assistantScope.assertMayManage(stripPrefix(id, 'asst'), context);
    const project = await this.findOrThrow(id, context);
    const orgDefaults = await this.getOrgDefaults(context.orgId);
    return toOpenAIAssistant(project, orgDefaults);
  }

  async create(
    dto: CreateAssistantDto,
    context: ApiContext,
  ): Promise<OpenAIAssistant> {
    // A key confined to one assistant cannot mint another. The new project
    // would be unreachable with this key and permanent in the organization —
    // a boundary that leaks in the one direction nobody checks.
    if (this.assistantScope.confinedToProject(context)) {
      throw new ForbiddenException(
        'This API key is scoped to a single assistant and cannot create another',
      );
    }

    // Create Project + ProjectSettings atomically. Prisma nested-write
    // handles the settings side for us — one round-trip, no orphans
    // on the instructions side if the settings insert would fail.
    const project = await this.prisma.client.project.create({
      data: {
        title: dto.name,
        organizationId: context.orgId,
        ownerId: context.userId,
        ...(dto.instructions
          ? {
              settings: {
                create: { instructions: dto.instructions },
              },
            }
          : {}),
      },
      select: this.projectSelect(),
    });

    const orgDefaults = await this.getOrgDefaults(context.orgId);
    return toOpenAIAssistant(project, orgDefaults);
  }

  async update(
    id: string,
    dto: UpdateAssistantDto,
    context: ApiContext,
  ): Promise<OpenAIAssistant> {
    const rawId = stripPrefix(id, 'asst');
    this.assistantScope.assertMayManage(rawId, context);
    await this.findOrThrow(id, context); // ensures it exists + org-scoped

    // OpenAI allows `instructions: null` to clear — we treat "undefined"
    // as "don't change", empty string as "clear".
    const shouldUpdateInstructions = dto.instructions !== undefined;

    const project = await this.prisma.client.project.update({
      where: { id: rawId },
      data: {
        ...(dto.name !== undefined ? { title: dto.name } : {}),
        ...(shouldUpdateInstructions
          ? {
              settings: {
                upsert: {
                  create: { instructions: dto.instructions ?? null },
                  update: { instructions: dto.instructions ?? null },
                },
              },
            }
          : {}),
      },
      select: this.projectSelect(),
    });

    const orgDefaults = await this.getOrgDefaults(context.orgId);
    return toOpenAIAssistant(project, orgDefaults);
  }

  async remove(
    id: string,
    context: ApiContext,
  ): Promise<{ id: string; object: 'assistant.deleted'; deleted: true }> {
    const rawId = stripPrefix(id, 'asst');
    this.assistantScope.assertMayManage(rawId, context);

    // Refuse to delete the project this API key is bound to — that
    // would revoke the key's own context without warning. Admins who
    // really want to delete it can either rotate the key first or use
    // the dashboard.
    if (rawId === (context.projectId as unknown as string)) {
      throw new BadRequestException(
        'Cannot delete the assistant this API key is bound to. Rotate the key first, then retry.',
      );
    }

    await this.findOrThrow(id, context);

    // findOrThrow → deleteMany has a TOCTOU window: a concurrent delete
    // could land between them. Use the affected-row count to report an
    // accurate result instead of claiming success when nothing actually
    // got deleted.
    const { count } = await this.prisma.client.project.deleteMany({
      where: {
        id: rawId,
        organizationId: context.orgId,
      },
    });
    if (count === 0) {
      throw new NotFoundException(`Assistant '${id}' not found`);
    }

    return { id, object: 'assistant.deleted', deleted: true };
  }

  private async findOrThrow(
    id: string,
    context: ApiContext,
  ): Promise<ProjectWithSettings> {
    const rawId = stripPrefix(id, 'asst');
    const project = await this.prisma.client.project.findFirst({
      where: {
        id: rawId,
        organizationId: context.orgId,
      },
      select: this.projectSelect(),
    });
    if (!project) {
      throw new NotFoundException(`Assistant '${id}' not found`);
    }
    return project;
  }

  /**
   * Read the org-level model + temperature so the mapper can surface
   * them on assistant objects that don't have per-project overrides.
   * Returns nulls when the row is missing so the mapper picks its own
   * defaults.
   */
  private async getOrgDefaults(orgId: string): Promise<OrgDefaults> {
    const settings = await this.prisma.client.organizationSettings.findUnique({
      where: { organizationId: orgId },
      select: { model: true, temperature: true },
    });
    return {
      model: settings?.model ?? null,
      temperature: settings?.temperature ?? null,
    };
  }

  private projectSelect() {
    return {
      id: true,
      title: true,
      createdAt: true,
      settings: { select: { instructions: true } },
    } as const;
  }
}
