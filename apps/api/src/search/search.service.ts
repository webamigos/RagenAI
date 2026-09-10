import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type ApiContext } from '../common/types/api-context.js';
import { type ProjectId } from '../common/types/brand.js';
import { stripPrefix } from '../common/utils/openai-format.js';
import { type SearchDto } from './dto/search.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiLimitsService } from '../api-limits/api-limits.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { ResolveLiteLLMKeyService } from '../teams/resolve-litellm-key.service.js';
import { InitializeBasicRagService } from '../chains/basic-rag/initialize-basic-rag.service.js';
import { retrieveRelevantDocumentsWithIds } from '../chains/basic-rag/operations.js';
import { AiUsageService } from '../ai-usage/ai-usage.service.js';

/**
 * `POST /v1/search` — retrieval only, no answer generation. Surfaced to MCP
 * clients as the `ragen_search_knowledge_base` tool (ADR-36): an external
 * assistant (e.g. another application's own AI, not one of Ragen's) can
 * ground itself in a Ragen knowledge base without going through Ragen's own
 * chat model.
 *
 * Mirrors `ChatService`'s assistant resolution and rate limiting exactly,
 * then calls `InitializeBasicRagService.buildRetrievalContext()` (the
 * search-only sibling of `initializeRagChain()`) instead of assembling a
 * full chain, and `retrieveRelevantDocumentsWithIds` directly instead of
 * `ragChain.stream()`.
 *
 * Deliberately has no `@UseFilters` override, unlike `AssistantsController`
 * — every thrown exception here goes through the global `ApiExceptionFilter`
 * and comes back as one consistent `{ message }` shape, rather than the
 * per-endpoint shapes `/v1/chat` accumulated (see ADR-36's "Consequences").
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiLimits: ApiLimitsService,
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly resolveLiteLLMKey: ResolveLiteLLMKeyService,
    private readonly initializeBasicRag: InitializeBasicRagService,
    private readonly aiUsage: AiUsageService,
  ) {}

  async search(
    dto: SearchDto,
    context: ApiContext,
  ): Promise<{ context: string; file_ids: string[] }> {
    const resolvedProjectId = stripPrefix(
      dto.assistant_id,
      'asst',
    ) as ProjectId;

    const project = await this.prisma.client.project.findFirst({
      where: { id: resolvedProjectId, organizationId: context.orgId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Assistant not found');
    }

    const apiLimit = await this.apiLimits.checkApiRequestLimit(context.orgId);
    if (apiLimit.exceeded) {
      throw new HttpException(
        'Monthly API request limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [rawSettings, ragPipelineSettings, keyResolution] = await Promise.all(
      [
        this.organizationSettings.getAllSettings(context.orgId),
        this.organizationSettings.getRagPipelineSettings(context.orgId),
        this.resolveLiteLLMKey.resolveForRequest({
          orgId: context.orgId,
          userId: context.userId,
          routeTag: 'v1.search',
        }),
      ],
    );

    const settings = {
      ...rawSettings,
      apiKey: rawSettings.apiKey ?? '',
      litellmApiKey: keyResolution.apiKey,
    };

    const trackAiUsage = (input: Parameters<AiUsageService['track']>[0]) =>
      this.aiUsage.track(input);

    const { vectorStore, metadataFilter } =
      await this.initializeBasicRag.buildRetrievalContext({
        settings,
        orgId: context.orgId,
        userId: context.userId,
        projectId: resolvedProjectId,
        trackAiUsage,
      });

    const maxResults = dto.max_results ?? settings.maxDocumentsToRetrieve;

    try {
      const { context: text, fileIds } = await retrieveRelevantDocumentsWithIds(
        vectorStore,
        dto.query,
        maxResults,
        metadataFilter,
        settings.litellmApiKey,
        ragPipelineSettings.rerankingEnabled,
        {
          organizationId: context.orgId,
          projectId: resolvedProjectId,
          userId: context.userId,
        },
        trackAiUsage,
      );

      return { context: text, file_ids: fileIds };
    } catch (error) {
      this.logger.error('Error in /search', error);
      throw new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
