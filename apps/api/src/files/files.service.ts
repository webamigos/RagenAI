import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ApiContext } from '../common/types/api-context.js';
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
  ) {}

  /**
   * List files visible to the caller's project. Direct Prisma — the
   * API key's project scope is the sole filter we need; there is no
   * cross-project visibility on this endpoint.
   */
  async list(
    context: ApiContext,
    query: ListFilesDto,
  ): Promise<OpenAIListEnvelope<OpenAIFile>> {
    const limit = query.limit ?? 20;
    const cursorId = query.after ? stripPrefix(query.after, 'file') : undefined;

    const rows = await this.prisma.client.userFile.findMany({
      where: {
        projectId: context.projectId as unknown as string,
      },
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

  /** Get one file by OpenAI-prefixed id. */
  async get(id: string, context: ApiContext): Promise<OpenAIFile> {
    const rawId = stripPrefix(id, 'file');
    const row = await this.prisma.client.userFile.findFirst({
      where: {
        id: rawId,
        projectId: context.projectId as unknown as string,
      },
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
