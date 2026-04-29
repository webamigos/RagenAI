import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { type OrganizationSettings } from '@/features/organizations/contracts/organization.types';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import type { VectorStoreClient } from '@/libs/vector-store/types';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createChatCompletionInstance,
  createModerationInstance,
  createEmbeddingsInstance,
} from '../../../lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { MeilisearchVectorStoreClient } from '@/libs/vector-store/meilisearch-client';
import { QdrantVectorStoreClient } from '@/libs/vector-store/qdrant-client';
import { SupabaseVectorStoreClient } from '@/libs/vector-store/supabase-client';
import { getOrganizationMetadataQuery as getOrganizationMetadata } from '@/features/organizations/services/queries/get-organization-metadata-query';
import { getRagPipelineSettings } from '@/features/organizations/services/organization-settings';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { decodeDualContentChunks } from './decode-dual-content-chunks';
import { getImportedKbFileIdsQuery } from '@/features/documents/services/queries/get-imported-kb-file-ids-query';
import type { ReasoningEffortLevel } from '@/libs/llm/types';
type InitializeRagChainParams = {
  settings: OrganizationSettings & { litellmApiKey?: string };
  orgId: string;
  userId?: string | null;
  userTeamIds?: string[];
  isOrgAdmin?: boolean;
  projectInstruction?: string | null;
  projectId?: string | null;
  threadDocuments?: ThreadDocumentUI[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpTools?: Record<string, any>;
  mcpContext?: string;
  /** Override the metadata filter — skips buildMetadataFilter when provided. */
  metadataFilter?: object;
  /**
   * Phase 2b — tool-call approval list, threaded into the chain's
   * experimental_context so `needsApproval` lets these specific
   * toolCallIds through without pausing.
   */
  approvedToolCalls?: readonly string[];
  /**
   * Per-request cap on generated tokens. Used by the OpenAI-compatible
   * endpoint to honor the caller's `max_tokens`. Undefined = provider default.
   */
  maxTokens?: number;
  /**
   * "Deep thinking" — forwarded as OpenAI `reasoning_effort` to the answer
   * generator only (rephrase stays cheap). Honored only by models flagged
   * `supportsReasoningEffort` (e.g. GPT-OSS via Scaleway).
   */
  reasoningEffort?: ReasoningEffortLevel;
};

const DEFAULT_REPHRASE_MODEL = process.env.REPHRASE_MODEL || 'gemini-2.5-flash';
const parsedRephraseTemp = Number(process.env.REPHRASE_TEMPERATURE);
const DEFAULT_REPHRASE_TEMPERATURE = Number.isNaN(parsedRephraseTemp)
  ? 0.5
  : parsedRephraseTemp;

export const initializeRagChain = async ({
  settings,
  orgId,
  userId,
  userTeamIds = [],
  isOrgAdmin = false,
  projectInstruction,
  projectId,
  threadDocuments,
  mcpTools,
  mcpContext,
  metadataFilter: metadataFilterOverride,
  approvedToolCalls,
  maxTokens,
  reasoningEffort,
}: InitializeRagChainParams) => {
  try {
    const {
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
      prompt: answerInstructions,
      maxDocumentsToRetrieve,
      litellmApiKey,
    } = settings;

    const embeddingModel = createEmbeddingsInstance({
      organizationId: orgId,
      userId: userId ?? undefined,
      projectId: projectId ?? undefined,
      litellmApiKey,
    });
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
      getOrganizationMetadata(orgId),
      getRagPipelineSettings(orgId),
    ]);
    let vectorStore: VectorStoreClient;

    if (orgMetadata.vectorStore === 'supabase') {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        orgId,
        projectId ?? undefined,
      );
    } else if (orgMetadata.vectorStore === 'meilisearch') {
      vectorStore = createMeilisearchVectorStore(embeddingModel, orgId);
    } else {
      // Default: Qdrant
      vectorStore = createQdrantVectorStore(embeddingModel, orgId);
    }

    // Supabase applies its own filter via constructor — don't pass metadataFilter
    const isSupabase = orgMetadata.vectorStore === 'supabase';
    const resolveMetadataFilter = async () => {
      if (isSupabase) {
        return undefined;
      }
      if (metadataFilterOverride) {
        return assertOrgIdInFilter(metadataFilterOverride, orgId);
      }
      return buildMetadataFilter(
        orgId,
        projectId ?? null,
        userId ?? null,
        userTeamIds,
        isOrgAdmin,
      );
    };
    const metadataFilter = await resolveMetadataFilter();

    const wrappedStore = wrapVectorStoreWithDualContentDecode(
      vectorStore,
      orgId,
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
    logger.error({ err: error }, 'Error initializing basic RAG chain');
    throw error;
  }
};

function wrapVectorStoreWithDualContentDecode(
  store: VectorStoreClient,
  orgId: string,
): VectorStoreClient {
  return {
    similaritySearch: async (query: string, k: number, filter?: object) => {
      const results = await store.similaritySearch(query, k, filter);
      return decodeDualContentChunks(results, orgId);
    },
    addDocuments: store.addDocuments.bind(store),
    ...(store.deleteDocuments
      ? { deleteDocuments: store.deleteDocuments.bind(store) }
      : {}),
  };
}

/**
 * Guardrail for the `metadataFilter` override param. Every override MUST
 * constrain `metadata.organization_id` so a bug in a caller cannot widen
 * retrieval across organizations. Throws synchronously — better to fail
 * the request than silently leak.
 */
function assertOrgIdInFilter<T extends object>(filter: T, orgId: string): T {
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
 * Uses an intermediate filter format that both Qdrant and Meilisearch clients understand.
 *
 * - Always filters by organization_id
 * - Non-admin users get accessible_by filter for document-level access control
 * - Thread with project: org_id AND (projectId = X OR fileId IN [imported_kb_source_ids])
 * - Thread without project (global KB): org_id AND projectId IS NULL
 */
async function buildMetadataFilter(
  orgId: string,
  projectId: string | null,
  userId: string | null,
  userTeamIds: string[],
  isOrgAdmin: boolean,
) {
  const orgCondition = {
    key: 'metadata.organization_id',
    match: { value: orgId },
  };

  // Build access control condition (org admins see everything)
  const mustConditions = [orgCondition];
  if (!isOrgAdmin && userId) {
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
    // Global KB: search files without a project
    return {
      must: [...mustConditions, { key: 'metadata.project_id', is_null: true }],
    };
  }

  // Project-scoped: search project files + imported KB files
  const importedSourceFileIds = await getImportedKbFileIdsQuery(
    projectId,
    orgId,
  );

  if (importedSourceFileIds.length === 0) {
    // No KB imports — simple project filter
    return {
      must: [
        ...mustConditions,
        { key: 'metadata.project_id', match: { value: projectId } },
      ],
    };
  }

  // Project files OR imported KB source file embeddings
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

const createQdrantVectorStore = (
  embeddingModel: EmbeddingsProvider,
  collectionName: string,
): VectorStoreClient => {
  logger.debug('creating qdrant vector store', {
    url: process.env.QDRANT_URL,
    collectionName,
  });

  return new QdrantVectorStoreClient(embeddingModel, {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
    collectionName,
  });
};

const createMeilisearchVectorStore = (
  embeddingModel: EmbeddingsProvider,
  indexName: string,
): VectorStoreClient => {
  logger.debug('creating meilisearch vector store', {
    url: process.env.MEILISEARCH_URL,
    indexName,
  });

  return new MeilisearchVectorStoreClient(embeddingModel, {
    url: process.env.MEILISEARCH_URL!,
    apiKey: process.env.MEILISEARCH_MASTER_KEY,
    indexName,
  });
};

const createSupabaseVectorStore = (
  client: SupabaseClient,
  embeddingModel: EmbeddingsProvider,
  organizationId: string,
  projectId?: string,
): VectorStoreClient => {
  try {
    // SECURITY CRITICAL: This organizationId filter is the primary security boundary
    // that prevents unauthorized access to documents across different organizations.
    // Removing or modifying this filter could lead to data leakage between organizations
    // and allow unauthorized access to sensitive documentation.
    const metadataFilter: Record<string, any> = {
      organization_id: organizationId,
    };

    if (projectId) {
      metadataFilter.project_id = projectId;
    }

    return new SupabaseVectorStoreClient(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating supabase vector store');
    throw error;
  }
};
