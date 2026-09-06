import { Injectable, Logger } from '@nestjs/common';
import type { OrgVisibilityScope } from '@ragenai/platform-contracts';
import { basicRagChain } from './chain.js';
import { wrapVectorStoreWithDualContentDecode } from './dual-content-decode.js';
import { createModerationInstance } from '../moderation-instance.js';
import {
  createChatCompletionInstance,
  createEmbeddingsInstance,
} from '../../llm/model-instances.js';
import { QdrantVectorStoreClient } from '../../vector-store/qdrant-client.js';
import { MeilisearchVectorStoreClient } from '../../vector-store/meilisearch-client.js';
import { SupabaseVectorStoreClient } from '../../vector-store/supabase-client.js';
import { getSupabaseVectorStoreClient } from '../../vector-store/supabase-vector-store-client-factory.js';
import { DOCUMENT_SEARCH_QUERY_NAME } from '../../vector-store/types.js';
import type { VectorStoreClient } from '../../vector-store/types.js';
import type { EmbeddingsProvider } from '../../llm/types/embeddings.js';
import type { ReasoningEffortLevel } from '../../llm/types/chat-completion.js';
import { type TrackAiUsage } from '../../ai-usage/types.js';
import { OrganizationSettingsService } from '../../organizations/organization-settings.service.js';
import { GetOrganizationMetadataService } from '../../organizations/get-organization-metadata.service.js';
import { GetImportedKbFileIdsService } from '../../documents/get-imported-kb-file-ids.service.js';
import { type OrganizationSettings } from '../../organizations/types.js';
import { type ThreadDocumentUI } from '../types/thread-document.js';
import { type BaseChatChainOutput } from '../types/common.js';

type InitializeRagChainParams = {
  settings: OrganizationSettings & { litellmApiKey?: string };
  orgId: string;
  userId?: string | null;
  userTeamIds?: string[];
  scope?: OrgVisibilityScope;
  projectInstruction?: string | null;
  projectId?: string | null;
  threadDocuments?: ThreadDocumentUI[];

  mcpTools?: Record<string, any>;
  mcpContext?: string;
  /** Override the metadata filter — skips buildMetadataFilter when provided. */
  metadataFilter?: object;
  approvedToolCalls?: readonly string[];
  maxTokens?: number;
  reasoningEffort?: ReasoningEffortLevel;
  trackAiUsage?: TrackAiUsage;
};

const DEFAULT_REPHRASE_MODEL = process.env.REPHRASE_MODEL || 'gemini-2.5-flash';
const parsedRephraseTemp = Number(process.env.REPHRASE_TEMPERATURE);
const DEFAULT_REPHRASE_TEMPERATURE = Number.isNaN(parsedRephraseTemp)
  ? 0.5
  : parsedRephraseTemp;

/**
 * Ported from apps/web's
 * src/app/api/threads/services/initializeBasicRag.ts — the chain factory:
 * picks the vector store implementation, resolves org settings, builds the
 * vector-store access filter, and assembles a ready-to-use basicRagChain
 * instance. See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Wraps the constructed vector store with
 * `wrapVectorStoreWithDualContentDecode` (dual-content-decode.ts) so the
 * opt-in, default-off `piiIngestionMode: 'dual_content'` org setting
 * returns real decrypted content instead of masked `pageContent` — this
 * was a KNOWN GAP when this service was first ported (see the ADR's Phase
 * B chat-cutover update); closed at cutover time, ahead of any real
 * traffic reaching this path.
 */
@Injectable()
export class InitializeBasicRagService {
  private readonly logger = new Logger(InitializeBasicRagService.name);

  constructor(
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly organizationMetadata: GetOrganizationMetadataService,
    private readonly importedKbFileIds: GetImportedKbFileIdsService,
  ) {}

  async initializeRagChain({
    settings,
    orgId,
    userId,
    userTeamIds = [],
    scope = 'member',
    projectInstruction,
    projectId,
    threadDocuments,
    mcpTools,
    mcpContext,
    metadataFilter: metadataFilterOverride,
    approvedToolCalls,
    maxTokens,
    reasoningEffort,
    trackAiUsage,
  }: InitializeRagChainParams): Promise<BaseChatChainOutput> {
    try {
      const {
        apiKey,
        model: answerModel,
        temperature: answerTemperature,
        prompt: answerInstructions,
        maxDocumentsToRetrieve,
        litellmApiKey,
      } = settings;

      const embeddingModel = createEmbeddingsInstance(
        {
          organizationId: orgId,
          userId: userId ?? undefined,
          projectId: projectId ?? undefined,
          litellmApiKey,
        },
        trackAiUsage,
      );
      const contentModerator = createModerationInstance();

      const questionRephraser = createChatCompletionInstance({
        apiKey,
        model: DEFAULT_REPHRASE_MODEL,
        temperature: DEFAULT_REPHRASE_TEMPERATURE,
        litellmApiKey,
      });
      const answerGenerator = createChatCompletionInstance({
        apiKey,
        model: answerModel,
        temperature: answerTemperature,
        litellmApiKey,
        reasoningEffort,
      });

      const [orgMetadata, ragPipelineSettings] = await Promise.all([
        this.organizationMetadata.get(orgId),
        this.organizationSettings.getRagPipelineSettings(orgId),
      ]);
      let vectorStore: VectorStoreClient;

      if (orgMetadata.vectorStore === 'supabase') {
        vectorStore = this.createSupabaseVectorStore(
          embeddingModel,
          orgId,
          projectId ?? undefined,
        );
      } else if (orgMetadata.vectorStore === 'meilisearch') {
        vectorStore = this.createMeilisearchVectorStore(embeddingModel, orgId);
      } else {
        vectorStore = this.createQdrantVectorStore(embeddingModel, orgId);
      }

      // Supabase applies its own filter via constructor — don't pass metadataFilter
      const isSupabase = orgMetadata.vectorStore === 'supabase';
      // Left un-annotated so TypeScript widens it from the assignment below —
      // the two branches return different filter shapes and spelling the union
      // out here would duplicate both.
      let metadataFilter;
      if (!isSupabase) {
        metadataFilter = metadataFilterOverride
          ? this.assertOrgIdInFilter(metadataFilterOverride, orgId)
          : await this.buildMetadataFilter(
              orgId,
              projectId ?? null,
              userId ?? null,
              userTeamIds,
              scope,
            );
      }

      const wrappedStore = wrapVectorStoreWithDualContentDecode(
        vectorStore,
        orgId,
        (id) => this.organizationSettings.getOrCreatePiiDek(id),
      );

      return await basicRagChain({
        models: {
          contentModerator,
          questionRephraser,
          answerGenerator,
          embeddings: embeddingModel,
        },
        config: {
          metadataFilter,
          maxDocumentsToRetrieve,
          maxTokens,
          litellmApiKey,
          answerInstructions: answerInstructions || '',
          projectInstruction: projectInstruction || '',
          threadDocuments: threadDocuments || [],
          mcpTools,
          mcpContext,
          approvedToolCalls: approvedToolCalls ?? [],
          tracking: { organizationId: orgId, projectId, userId },
          trackAiUsage,
          ragSettings: {
            multiQueryEnabled: ragPipelineSettings.multiQueryEnabled,
            contentModerationEnabled:
              ragPipelineSettings.contentModerationEnabled,
            rerankingEnabled: ragPipelineSettings.rerankingEnabled,
          },
        },
        vectorStore: wrappedStore,
      });
    } catch (error) {
      this.logger.error('Error initializing basic RAG chain', { err: error });
      throw error;
    }
  }

  /**
   * Guardrail for the `metadataFilter` override param. Every override MUST
   * constrain `metadata.organization_id` so a bug in a caller cannot widen
   * retrieval across organizations. Throws synchronously — better to fail
   * the request than silently leak.
   */
  private assertOrgIdInFilter<T extends object>(filter: T, orgId: string): T {
    const mustList = (filter as { must?: unknown[] }).must;
    if (!Array.isArray(mustList)) {
      throw new Error(
        'metadataFilter override must include a `must` array with organization_id',
      );
    }
    const hasOrgId = mustList.some((c) => {
      if (!c || typeof c !== 'object') {
        return false;
      }
      const cond = c as { key?: unknown; match?: { value?: unknown } };
      return (
        cond.key === 'metadata.organization_id' && cond.match?.value === orgId
      );
    });
    if (!hasOrgId) {
      throw new Error(
        `metadataFilter override missing required metadata.organization_id=${orgId} constraint`,
      );
    }
    return filter;
  }

  /**
   * Build metadata filter based on project context and user access.
   *
   * - Always filters by organization_id
   * - Non-admin users get accessible_by filter for document-level access control
   * - Thread with project: org_id AND (projectId = X OR fileId IN [imported_kb_source_ids])
   * - Thread without project (global KB): org_id AND projectId IS NULL
   */
  private async buildMetadataFilter(
    orgId: string,
    projectId: string | null,
    userId: string | null,
    userTeamIds: string[],
    scope: OrgVisibilityScope,
  ) {
    const orgCondition = {
      key: 'metadata.organization_id',
      match: { value: orgId },
    };

    const mustConditions = [orgCondition];
    if (scope !== 'organization' && userId) {
      const accessiblePrincipals: string[] = [`org:${orgId}`, `user:${userId}`];
      for (const teamId of userTeamIds) {
        accessiblePrincipals.push(`team:${teamId}`);
      }
      mustConditions.push({
        key: 'metadata.accessible_by',
        match_any: { values: accessiblePrincipals },
      } as unknown as typeof orgCondition);
    }

    if (!projectId) {
      return {
        must: [
          ...mustConditions,
          { key: 'metadata.project_id', is_null: true },
        ],
      };
    }

    const importedSourceFileIds = await this.importedKbFileIds.get(
      projectId,
      orgId,
    );

    if (importedSourceFileIds.length === 0) {
      return {
        must: [
          ...mustConditions,
          { key: 'metadata.project_id', match: { value: projectId } },
        ],
      };
    }

    return {
      must: mustConditions,
      should: [
        { key: 'metadata.project_id', match: { value: projectId } },
        {
          key: 'metadata.file_id',
          match_any: { values: importedSourceFileIds },
        },
      ],
    };
  }

  private createQdrantVectorStore(
    embeddingModel: EmbeddingsProvider,
    collectionName: string,
  ): VectorStoreClient {
    this.logger.debug('creating qdrant vector store', {
      url: process.env.QDRANT_URL,
      collectionName,
    });

    return new QdrantVectorStoreClient(embeddingModel, {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      collectionName,
    });
  }

  private createMeilisearchVectorStore(
    embeddingModel: EmbeddingsProvider,
    indexName: string,
  ): VectorStoreClient {
    this.logger.debug('creating meilisearch vector store', {
      url: process.env.MEILISEARCH_URL,
      indexName,
    });

    return new MeilisearchVectorStoreClient(embeddingModel, {
      url: process.env.MEILISEARCH_URL!,
      apiKey: process.env.MEILISEARCH_MASTER_KEY,
      indexName,
    });
  }

  private createSupabaseVectorStore(
    embeddingModel: EmbeddingsProvider,
    organizationId: string,
    projectId?: string,
  ): VectorStoreClient {
    try {
      // SECURITY CRITICAL: This organizationId filter is the primary security
      // boundary that prevents unauthorized access to documents across
      // different organizations. Removing or modifying this filter could
      // lead to data leakage between organizations.
      const metadataFilter: Record<string, unknown> = {
        organization_id: organizationId,
      };
      if (projectId) {
        metadataFilter.project_id = projectId;
      }

      return new SupabaseVectorStoreClient(embeddingModel, {
        client: getSupabaseVectorStoreClient(),
        queryName: DOCUMENT_SEARCH_QUERY_NAME,
        filter: metadataFilter,
      });
    } catch (error) {
      this.logger.error('Error creating supabase vector store', {
        err: error,
      });
      throw error;
    }
  }
}
