import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import FormData from 'form-data';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RagenAppClient,
  RagenAppError,
} from '../common/services/ragen-app.client.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  buildList,
  stripPrefix,
  type OpenAIListEnvelope,
} from '../common/utils/openai-format.js';
import { toOpenAIFile, type OpenAIFile } from './files.mapper.js';
import { type ListFilesDto } from './dto/list-files.dto.js';

type UpstreamFileResponse = {
  file: {
    id: string;
    fileName: string;
    fileSize: number;
    createdAt: string | null;
    parsingStatus: string;
    embeddingStatus: string;
  };
  workflowId: string;
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragenApp: RagenAppClient,
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
   * Upload a file. Multipart body is forwarded verbatim to ragen-app's
   * internal `/api/v1/files` — that route owns the S3 + Temporal
   * pipeline via `uploadFileCommand`.
   */
  async upload(
    file: Express.Multer.File,
    purpose: string | undefined,
    context: ApiContext,
    req: Request,
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

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
      knownLength: file.size,
    });

    let upstream: globalThis.Response;
    try {
      upstream = await this.ragenApp.request({
        method: 'POST',
        path: '/api/v1/files',
        context,
        body: form.getBuffer(),
        rawBody: true,
        headers: form.getHeaders(),
        signal: abortController.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      throw err;
    }

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      throw new RagenAppError(upstream.status, body);
    }

    const data = (await upstream.json()) as UpstreamFileResponse;
    // OpenAI's Files API returns 200 on create; NestJS defaults POST
    // handlers to 201 so we set it explicitly to match.
    res.status(200).json(
      toOpenAIFile({
        id: data.file.id,
        fileName: data.file.fileName,
        fileSize: data.file.fileSize,
        createdAt: data.file.createdAt ? new Date(data.file.createdAt) : null,
        parsingStatus: data.file.parsingStatus,
        embeddingStatus: data.file.embeddingStatus,
      }),
    );
  }

  /**
   * Delete a file + all cleanup (S3 + vectors + UserDocument). Routed
   * through ragen-app so the same `deleteFileCommand` powers all
   * deletion flows.
   */
  async remove(
    id: string,
    context: ApiContext,
  ): Promise<{ id: string; object: 'file'; deleted: true }> {
    const rawId = stripPrefix(id, 'file');
    await this.ragenApp.requestJson({
      method: 'DELETE',
      path: `/api/v1/files/${encodeURIComponent(rawId)}`,
      context,
    });
    return { id, object: 'file', deleted: true };
  }
}
