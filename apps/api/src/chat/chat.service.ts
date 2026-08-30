import { Injectable, Logger } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type ApiContext } from '../common/types/api-context.js';
import { type ProjectId } from '../common/types/brand.js';
import { stripPrefix } from '../common/utils/openai-format.js';
import { type ChatDto } from './dto/chat.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiLimitsService } from '../api-limits/api-limits.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { ResolveLiteLLMKeyService } from '../teams/resolve-litellm-key.service.js';
import { LoadMcpToolsService } from '../mcp/load-mcp-tools.service.js';
import { InitializeBasicRagService } from '../chains/basic-rag/initialize-basic-rag.service.js';
import { PersistApiThreadService } from '../threads/persist-api-thread.service.js';
import { AiUsageService } from '../ai-usage/ai-usage.service.js';
import { supportsReasoningEffort } from '../llm/model-registry.js';

/**
 * Direct implementation of `POST /v1/chat` — replaces the previous
 * RagenAppClient proxy to ragen-app's internal `/api/v1/chat`. Ported
 * orchestration logic from ragen-app's
 * src/app/api/v1/chat/route.ts, wired against the RAG-engine services
 * ported in earlier Phase B slices instead of an HTTP call. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Public contract (ChatController/ChatDto) is unchanged — only what
 * happens inside this service changed.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

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

  async chat(dto: ChatDto, context: ApiContext, req: Request, res: Response) {
    const isStream = dto.stream === true;

    const resolvedProjectId = stripPrefix(
      dto.assistant_id,
      'asst',
    ) as ProjectId;

    const project = await this.prisma.client.project.findFirst({
      where: { id: resolvedProjectId, organizationId: context.orgId },
      select: { settings: { select: { instructions: true } } },
    });

    if (!project) {
      res.status(404).json({ error: 'Assistant not found', code: 404 });
      return;
    }

    const apiLimit = await this.apiLimits.checkApiRequestLimit(context.orgId);
    if (apiLimit.exceeded) {
      res.status(429).json({
        error: 'Monthly API request limit exceeded',
        code: 429,
        limit: apiLimit.limit,
        current: apiLimit.current,
      });
      return;
    }

    const [rawSettings, keyResolution] = await Promise.all([
      this.organizationSettings.getAllSettings(context.orgId),
      this.resolveLiteLLMKey.resolveForRequest({
        orgId: context.orgId,
        userId: context.userId,
        routeTag: 'v1.chat',
      }),
    ]);

    const settings = {
      ...rawSettings,
      apiKey: rawSettings.apiKey ?? '',
      litellmApiKey: keyResolution.apiKey,
    };

    const { mcpTools, mcpContext, closeMcpClients } =
      await this.loadMcpTools.loadMcpToolsForApiRequest({
        orgId: context.orgId,
        userId: context.userId,
        projectId: resolvedProjectId,
      });

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      const effectiveModel = settings.model;
      const derivedReasoningEffort =
        dto.reasoning_effort ??
        (effectiveModel && supportsReasoningEffort(effectiveModel)
          ? 'medium'
          : undefined);

      const ragChain = await this.initializeBasicRag.initializeRagChain({
        settings,
        orgId: context.orgId,
        userId: context.userId,
        projectId: resolvedProjectId,
        projectInstruction: project.settings?.instructions ?? null,
        mcpTools,
        mcpContext,
        reasoningEffort: derivedReasoningEffort,
        trackAiUsage: (input) => this.aiUsage.track(input),
      });

      const question = dto.context
        ? `${dto.content}\n\nKontekst strony:\n${dto.context}`
        : dto.content;

      // Debug mode comes from the API key's DB record (ApiKeyGuard), not a
      // client-supplied header — unlike the ragen-app original, which
      // trusted an `x-debug-mode` header forwarded by the (now-removed)
      // proxy hop.
      const apiThread = context.debugMode
        ? await this.persistApiThread.createApiThread({
            orgId: context.orgId,
            userId: context.userId,
            projectId: resolvedProjectId,
            question,
          })
        : null;
      const threadId = apiThread?.threadId ?? null;
      const saveAssistantMessage = apiThread?.saveAssistantMessage;

      const result = await ragChain.stream({ question, chat_history: '' });

      const modelId = settings.model || '';
      const trackUsage = async () => {
        const usage = await Promise.resolve(result.usage).catch(
          () => undefined,
        );
        if (!usage) {
          return;
        }
        await this.aiUsage.track({
          organizationId: context.orgId,
          projectId: resolvedProjectId,
          threadId,
          userId: context.userId,
          step: 'CHAT_COMPLETION',
          // Every model routes through LiteLLM in this deployment — see
          // ragen-app's getModelProvider(), which always returns this too.
          provider: 'litellm',
          model: modelId,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          metadata: { source: 'API' },
        });
      };

      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Content-Encoding', 'none');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        try {
          let fullText = '';
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullText += part.textDelta;
              res.write(
                `data: ${JSON.stringify({ text: part.textDelta })}\n\n`,
              );
            } else if (part.type === 'reasoning-delta') {
              res.write(
                `data: ${JSON.stringify({ reasoning: part.delta })}\n\n`,
              );
            }
          }
          if (saveAssistantMessage) {
            await saveAssistantMessage(fullText);
          }
          await trackUsage();
          res.write('data: [DONE]\n\n');
        } catch (err) {
          this.logger.error('Error streaming /chat response', err);
        } finally {
          await closeMcpClients();
          res.end();
        }
        return;
      }

      // Non-streaming: collect the full response and return JSON.
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
      await trackUsage();

      res.json({ text });
    } catch (error) {
      await closeMcpClients();

      if ((error as Error)?.name === 'AbortError') {
        return;
      }

      this.logger.error('Error in /chat', error);
      res.status(500).send('Internal Server Error');
    }
  }
}
