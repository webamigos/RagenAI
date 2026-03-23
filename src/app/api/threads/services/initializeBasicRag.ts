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
import { SupabaseVectorStoreClient } from '@/libs/vector-store/supabase-client';
import { getOrganizationMetadataQuery as getOrganizationMetadata } from '@/features/organizations/services/queries/get-organization-metadata-query';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { getImportedKbFileIdsQuery } from '@/features/documents/services/queries/get-imported-kb-file-ids-query';
type InitializeRagChainParams = {
  settings: OrganizationSettings & { litellmApiKey?: string };
  orgId: string;
  userId?: string | null;
  projectInstruction?: string | null;
  projectId?: number | null;
  projectPublicId?: string | null;
  threadDocuments?: ThreadDocumentUI[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpTools?: Record<string, any>;
  mcpContext?: string;
};

const DEFAULT_REPHRASE_MODEL = process.env.REPHRASE_MODEL || 'gemini-2.0-flash';
const parsedRephraseTemp = Number(process.env.REPHRASE_TEMPERATURE);
const DEFAULT_REPHRASE_TEMPERATURE = Number.isNaN(parsedRephraseTemp)
  ? 0.5
  : parsedRephraseTemp;

export const initializeRagChain = async ({
  settings,
  orgId,
  userId,
  projectInstruction,
  projectId,
  projectPublicId,
  threadDocuments,
  mcpTools,
  mcpContext,
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
    });

    const orgMetadata = await getOrganizationMetadata(orgId);
    let vectorStore: VectorStoreClient;
    let isMeilisearch = false;

    if (orgMetadata.vectorStore === 'supabase') {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        orgId,
        projectPublicId ?? undefined,
      );
    } else {
      vectorStore = createMeilisearchVectorStore(embeddingModel, orgId);
      isMeilisearch = true;
    }

    const filterOptions = isMeilisearch
      ? await buildMeilisearchFilter(orgId, projectId ?? null)
      : undefined;

    return await basicRagChain({
      models: {
        contentModerator,
        questionRephraser,
        answerGenerator,
        embeddings: embeddingModel,
      },
      config: {
        // SupabaseVectorStore already has filter set in constructor, passing another filter causes error
        // MeilisearchVectorStore needs filter passed to similaritySearch()
        metadataFilter: filterOptions,
        maxDocumentsToRetrieve,
        answerInstructions: answerInstructions || '',
        projectInstruction: projectInstruction || '',
        threadDocuments: threadDocuments || [],
        mcpTools,
        mcpContext,
        tracking: { organizationId: orgId, projectId, userId },
      },
      vectorStore,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing basic RAG chain');
    throw error;
  }
};

/**
 * Build Meilisearch filter based on project context:
 * - Thread with project: org_id AND (projectId = X OR fileId IN [imported_kb_source_ids])
 * - Thread without project (global KB): org_id AND projectId IS NULL
 */
async function buildMeilisearchFilter(orgId: string, projectId: number | null) {
  const orgCondition = {
    key: 'metadata.organization_id',
    match: { value: orgId },
  };

  if (!projectId) {
    // Global KB: search files without a project
    return {
      must: [orgCondition, { key: 'metadata.project_id', is_null: true }],
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
        orgCondition,
        { key: 'metadata.project_id', match: { value: projectId } },
      ],
    };
  }

  // Project files OR imported KB source file embeddings
  return {
    must: [orgCondition],
    should: [
      { key: 'metadata.project_id', match: { value: projectId } },
      {
        key: 'metadata.file_id',
        match_any: { values: importedSourceFileIds },
      },
    ],
  };
}

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
  projectPublicId?: string,
): VectorStoreClient => {
  try {
    // SECURITY CRITICAL: This organizationId filter is the primary security boundary
    // that prevents unauthorized access to documents across different organizations.
    // Removing or modifying this filter could lead to data leakage between organizations
    // and allow unauthorized access to sensitive documentation.
    const metadataFilter: Record<string, any> = {
      organization_id: organizationId,
    };

    if (projectPublicId) {
      metadataFilter.project_public_id = projectPublicId;
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
