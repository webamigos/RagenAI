import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type ApiContext } from '../common/types/api-context.js';
import { type ProjectId } from '../common/types/brand.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiLimitsService } from '../api-limits/api-limits.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { ResolveLiteLLMKeyService } from '../teams/resolve-litellm-key.service.js';
import { LoadMcpToolsService } from '../mcp/load-mcp-tools.service.js';
import { InitializeBasicRagService } from '../chains/basic-rag/initialize-basic-rag.service.js';
import { PersistApiThreadService } from '../threads/persist-api-thread.service.js';
import { AiUsageService } from '../ai-usage/ai-usage.service.js';
import { foldMessages, mergeProjectInstruction } from './fold-messages.js';
import {
  buildChatCompletion,
  buildChatCompletionChunk,
  chatCompletionId,
  encodeSseData,
  nowUnixSeconds,
  stripPrefix,
  SSE_DONE,
  type OpenAIChatCompletionChunk,
  type OpenAIUsage,
} from '../common/utils/openai-format.js';
import { type CreateChatCompletionDto } from './dto/create-chat-completion.dto.js';

/**
 * Direct implementation of `POST /v1/chat/completions` — replaces the
 * previous RagenAppClient proxy to ragen-app's internal
 * `/api/v1/chat/completions`. Ported orchestration logic from
 * ragen-app's src/app/api/v1/chat/completions/route.ts, wired against
 * the RAG-engine services ported in Phase B instead of an HTTP call —
 * same treatment as ChatService's `/v1/chat` cutover. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * This is the OpenAI-compatible surface: request/response translation
 * (messages array, model/temperature overrides, chat.completion(.chunk)
 * envelopes) still happens here via `common/utils/openai-format.ts` —
 * only the "call ragen-app over HTTP" step was replaced with a direct
 * call into the ported RAG chain.
 *
 * Deviation from the ragen-app original: debug-mode thread persistence
 * is gated on `context.debugMode` (the API key's DB record, set by
 * `ApiKeyGuard`) rather than a client-supplied `x-debug-mode` header —
 * same rationale as ChatService, see its class-level comment.
 */
@Injectable()
export class ChatCompletionsService {
  private readonly logger = new Logger(ChatCompletionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiLimits: ApiLimitsService,
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly resolveLiteLLMKey: ResolveLiteLLMKeyService,
    private readonly loadMcpTools: LoadMcpToolsService,
    private readonly initializeBasicRag: InitializeBasicRagService,
    private readonly persistApiThread: PersistApiThreadService,
    private readonly aiUsage: AiUsageService,
  ) {}

  async create(
    dto: CreateChatCompletionDto,
    context: ApiContext,
    req: Request,
    res: Response,
  ): Promise<void> {
    const isStream = dto.stream === true;
    const includeUsage =
      !isStream || dto.stream_options?.include_usage === true;

    const resolvedProjectId = stripPrefix(
      dto.assistant_id,
      'asst',
    ) as ProjectId;

    const project = await this.prisma.client.project.findFirst({
      where: { id: resolvedProjectId, organizationId: context.orgId },
      select: { settings: { select: { instructions: true } } },
    });

    if (!project) {
      throw new NotFoundException('Assistant not found');
    }

    const apiLimit = await this.apiLimits.checkApiRequestLimit(context.orgId);
    if (apiLimit.exceeded) {
      throw new HttpException(
        `Monthly API request limit exceeded (current: ${apiLimit.current}, limit: ${apiLimit.limit})`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [rawSettings, keyResolution] = await Promise.all([
      this.organizationSettings.getAllSettings(context.orgId),
      this.resolveLiteLLMKey.resolveForRequest({
        orgId: context.orgId,
        userId: context.userId,
        routeTag: 'v1.chat.completions',
      }),
    ]);

    // Apply per-request overrides on top of the org defaults. Undefined
    // overrides leave the org value untouched.
    const settings = {
      ...rawSettings,
      apiKey: rawSettings.apiKey ?? '',
      litellmApiKey: keyResolution.apiKey,
      ...(dto.model !== undefined ? { model: dto.model } : {}),
      ...(dto.temperature !== undefined
        ? { temperature: dto.temperature }
        : {}),
    };

    const effectiveModel = settings.model || dto.model || 'ragen';

    const { question, chatHistory, systemPrompts } = foldMessages(dto.messages);

    const { mcpTools, mcpContext, closeMcpClients } =
      await this.loadMcpTools.loadMcpToolsForApiRequest({
        orgId: context.orgId,
        userId: context.userId,
        projectId: resolvedProjectId,
      });

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      const ragChain = await this.initializeBasicRag.initializeRagChain({
        settings,
        orgId: context.orgId,
        userId: context.userId,
        projectId: resolvedProjectId,
        projectInstruction: mergeProjectInstruction(
          project.settings?.instructions ?? null,
          systemPrompts,
        ),
        maxTokens: dto.max_tokens,
        mcpTools,
        mcpContext,
        trackAiUsage: (input) => this.aiUsage.track(input),
      });

      const apiThread = context.debugMode
        ? await this.persistApiThread.createApiThread({
            orgId: context.orgId,
            userId: context.userId,
            projectId: resolvedProjectId,
            question,
            chatHistory,
          })
        : null;
      const threadId = apiThread?.threadId ?? null;
      const saveAssistantMessage = apiThread?.saveAssistantMessage;

      const result = await ragChain.stream({
        question,
        chat_history: chatHistory,
      });

      const trackUsage = async (): Promise<OpenAIUsage | undefined> => {
        const usage = await Promise.resolve(result.usage).catch(
          () => undefined,
        );
        if (!usage) {
          return undefined;
        }
        await this.aiUsage.track({
          organizationId: context.orgId,
          projectId: resolvedProjectId,
          threadId,
          userId: context.userId,
          step: 'CHAT_COMPLETION',
          // Every model routes through LiteLLM in this deployment.
          provider: 'litellm',
          model: effectiveModel,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          metadata: { source: 'API' },
        });
        return {
          prompt_tokens: usage.inputTokens ?? 0,
          completion_tokens: usage.outputTokens ?? 0,
          total_tokens: usage.totalTokens ?? 0,
        };
      };

      if (isStream) {
        try {
          await this.streamChunks({
            textStream: result.textStream,
            res,
            abortController,
            model: effectiveModel,
            includeUsage,
            trackUsage,
            saveAssistantMessage,
          });
        } finally {
          await closeMcpClients();
        }
        return;
      }

      let text = '';
      try {
        for await (const chunk of result.textStream) {
          text += chunk;
        }
      } finally {
        await closeMcpClients();
      }
      if (saveAssistantMessage) {
        await saveAssistantMessage(text);
      }
      const usage = await trackUsage();

      res
        .status(200)
        .json(
          buildChatCompletion({ model: effectiveModel, content: text, usage }),
        );
    } catch (error) {
      await closeMcpClients();

      if ((error as Error)?.name === 'AbortError') {
        return;
      }

      throw error;
    }
  }

  /**
   * Stream the RAG chain's text deltas as OpenAI `chat.completion.chunk`
   * SSE events. Errors are swallowed and logged (never rethrown) — once
   * headers/body are written, a thrown exception can no longer be
   * formatted by `OpenAiExceptionFilter`, same reasoning as ChatService's
   * streaming branch.
   */
  private async streamChunks(params: {
    textStream: AsyncIterable<string>;
    res: Response;
    abortController: AbortController;
    model: string;
    includeUsage: boolean;
    trackUsage: () => Promise<OpenAIUsage | undefined>;
    saveAssistantMessage?: (content: string) => Promise<void>;
  }): Promise<void> {
    const {
      textStream,
      res,
      abortController,
      model,
      includeUsage,
      trackUsage,
      saveAssistantMessage,
    } = params;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Encoding', 'none');
    res.flushHeaders();

    const id = chatCompletionId();
    const created = nowUnixSeconds();

    res.write(
      encodeSseData(
        buildChatCompletionChunk({
          id,
          model,
          created,
          delta: { role: 'assistant' },
        }),
      ),
    );

    try {
      let fullText = '';
      for await (const chunk of textStream) {
        fullText += chunk;
        res.write(
          encodeSseData(
            buildChatCompletionChunk({
              id,
              model,
              created,
              delta: { content: chunk },
            }),
          ),
        );
      }

      if (saveAssistantMessage) {
        await saveAssistantMessage(fullText);
      }
      const usage = await trackUsage();

      if (!res.writableEnded && !abortController.signal.aborted) {
        res.write(
          encodeSseData(
            buildChatCompletionChunk({
              id,
              model,
              created,
              delta: {},
              finishReason: 'stop',
            }),
          ),
        );

        if (includeUsage && usage) {
          const usageChunk: OpenAIChatCompletionChunk = {
            id,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [],
            usage,
          };
          res.write(encodeSseData(usageChunk));
        }

        res.write(SSE_DONE);
        res.end();
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        this.logger.error('Stream error in /chat/completions', error);
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
