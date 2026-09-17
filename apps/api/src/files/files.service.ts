import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';
import {
  buildError,
  buildList,
  stripPrefix,
  type OpenAIListEnvelope,
} from '../common/utils/openai-format.js';
import { toOpenAIFile, type OpenAIFile } from './files.mapper.js';
import { type ListFilesDto } from './dto/list-files.dto.js';
import {
  UploadFileService,
  UploadRejectedError,
  type UploadFileResult,
} from '../documents/upload-file.service.js';
import { DeleteFileService } from '../documents/delete-file.service.js';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadFile: UploadFileService,
    private readonly deleteFile: DeleteFileService,
    private readonly assistantScope: AssistantScopeService,
  ) {}

  /**
   * The `where` every read on this controller starts from.
   *
   * `organizationId` is unconditional and load-bearing: it was once absent,
   * on the reasoning that the API key's project was "the sole filter we
   * need", and because no key has ever carried a project the clause it stood
   * in for evaluated to `undefined` — which Prisma drops — so this endpoint
   * listed every file in every organization. A filter that is only correct
   * when an optional value is present is not a filter.
   *
   * Within the org, the key's scope narrows: an assistant key sees that
   * assistant's files, a knowledge-base key sees the files that belong to no
   * assistant — the same split the retrieval filter makes. A context with no
   * key scope (session-authenticated, internal) narrows by its project if it
   * has one, as before.
   */
  private visibleFiles(context: ApiContext) {
    const orgScope = { organizationId: context.orgId };

    switch (context.knowledgeScope) {
      case 'ASSISTANT':
        return {
          ...orgScope,
          projectId: this.assistantScope.confinedToProject(context),
        };
      case 'KNOWLEDGE_BASE':
        return { ...orgScope, projectId: null };
      default:
        return {
          ...orgScope,
          ...(context.projectId ? { projectId: context.projectId } : {}),
        };
    }
  }

  /** List the files this caller can see — see `visibleFiles`. */
  async list(
    context: ApiContext,
    query: ListFilesDto,
  ): Promise<OpenAIListEnvelope<OpenAIFile>> {
    const limit = query.limit ?? 20;
    const cursorId = query.after ? stripPrefix(query.after, 'file') : undefined;

    const rows = await this.prisma.client.userFile.findMany({
      where: this.visibleFiles(context),
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        parsingStatus: true,
        embeddingStatus: true,
      },
    });

    return buildList(rows.map((r) => toOpenAIFile(r)));
  }

  /** Get one file by OpenAI-prefixed id, within `visibleFiles`. */
  async get(id: string, context: ApiContext): Promise<OpenAIFile> {
    const rawId = stripPrefix(id, 'file');
    const row = await this.prisma.client.userFile.findFirst({
      where: { id: rawId, ...this.visibleFiles(context) },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        parsingStatus: true,
        embeddingStatus: true,
      },
    });
    if (!row) {
      throw new NotFoundException(`File '${id}' not found`);
    }
    return toOpenAIFile(row);
  }

  /**
   * Upload a file — runs the full ingest pipeline (limits, S3, Temporal)
   * directly via `UploadFileService`, no longer proxied to apps/web.
   */
  async upload(
    file: Express.Multer.File,
    purpose: string | undefined,
    context: ApiContext,
    _req: Request,
    res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Missing file in multipart body');
    }
    if (purpose && !['knowledge_base', 'assistants'].includes(purpose)) {
      throw new BadRequestException(
        `Unsupported purpose '${purpose}' (expected 'knowledge_base' or 'assistants')`,
      );
    }

    const organization = await this.prisma.client.organization.findUnique({
      where: { id: context.orgId },
      select: { slug: true },
    });

    let result: UploadFileResult;
    try {
      result = await this.uploadFile.uploadFile({
        file,
        organizationId: context.orgId,
        organizationSlug: organization?.slug ?? null,
        projectId: context.projectId ?? null,
        userId: context.userId,
      });
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        const status =
          err.reason === 's3_upload_failed' ||
          err.reason === 'workflow_start_failed'
            ? 502
            : 413;
        res.status(status).json(
          buildError({
            message: err.message,
            type: 'invalid_request_error',
            code: status,
          }),
        );
        return;
      }
      throw err;
    }

    if (res.writableEnded) {
      return;
    }

    // OpenAI's Files API returns 200 on create; NestJS defaults POST
    // handlers to 201 so we set it explicitly to match.
    res.status(200).json(toOpenAIFile(result.fileRecord));
  }

  /**
   * Delete a file + all cleanup (S3 + vectors + UserDocument) directly
   * via `DeleteFileService`, no longer proxied to apps/web.
   */
  async remove(
    id: string,
    context: ApiContext,
  ): Promise<{ id: string; object: 'file'; deleted: true }> {
    const rawId = stripPrefix(id, 'file');

    // `deleteFile` scopes by organization, which was the whole boundary when
    // a key reached the whole organization. It no longer is: a key confined
    // to one assistant must not delete another assistant's file, so the same
    // visibility used for reads decides whether this file exists for this
    // caller at all.
    const visible = await this.prisma.client.userFile.findFirst({
      where: { id: rawId, ...this.visibleFiles(context) },
      select: { id: true },
    });
    if (!visible) {
      throw new NotFoundException(`File '${id}' not found`);
    }

    const result = await this.deleteFile.deleteFile({
      fileId: rawId,
      organizationId: context.orgId,
    });
    if (!result.deleted) {
      throw new NotFoundException(`File '${id}' not found`);
    }
    return { id, object: 'file', deleted: true };
  }
}
