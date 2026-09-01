import {
  BadRequestException,
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
import { type CreateAssistantDto } from './dto/create-assistant.dto.js';
import { type UpdateAssistantDto } from './dto/update-assistant.dto.js';
import { type ListAssistantsDto } from './dto/list-assistants.dto.js';

@Injectable()
export class AssistantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List assistants in the caller's org. We deliberately scope by
   * organization (not project) because:
   *  1. OpenAI's `client.assistants.list()` is expected to return many
   *     entries, not the single project the API key is bound to.
   *  2. The key's `projectId` is the *default project for chat/files*,
   *     not a visibility boundary across assistants.
   */
  async list(
    context: ApiContext,
    query: ListAssistantsDto,
  ): Promise<OpenAIListEnvelope<OpenAIAssistant>> {
    const limit = query.limit ?? 20;
    const order = query.order ?? 'desc';
    const cursorId = query.after ? stripPrefix(query.after, 'asst') : undefined;

    const rows = await this.prisma.client.project.findMany({
      where: { organizationId: context.orgId },
      orderBy: { createdAt: order },
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: this.projectSelect(),
    });

    const orgDefaults = await this.getOrgDefaults(context.orgId);
    return buildList(rows.map((p) => toOpenAIAssistant(p, orgDefaults)));
  }

  async get(id: string, context: ApiContext): Promise<OpenAIAssistant> {
    const project = await this.findOrThrow(id, context);
    const orgDefaults = await this.getOrgDefaults(context.orgId);
    return toOpenAIAssistant(project, orgDefaults);
  }

  async create(
    dto: CreateAssistantDto,
    context: ApiContext,
  ): Promise<OpenAIAssistant> {
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
