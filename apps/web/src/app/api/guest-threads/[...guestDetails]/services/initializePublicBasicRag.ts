import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { type OrganizationSettings } from '@/features/organizations/contracts/organization.types';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import type { VectorStoreClient } from '@/libs/vector-store/types';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/app/lib/utils/logger';
import {
  createChatCompletionInstance,
  createEmbeddingsInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { getOrganizationMetadataQuery as getOrganizationMetadata } from '@/features/organizations/services/queries/get-organization-metadata-query';
import { getRagPipelineSettings } from '@/features/organizations/services/organization-settings';
import { wrapVectorStoreWithDualContentDecode } from '@/app/api/threads/services/decode-dual-content-chunks';
import { MeilisearchVectorStoreClient } from '@/libs/vector-store/meilisearch-client';
import { QdrantVectorStoreClient } from '@/libs/vector-store/qdrant-client';
import { SupabaseVectorStoreClient } from '@/libs/vector-store/supabase-client';

type InitializePublicRagChainParams = {
  settings: OrganizationSettings & { litellmApiKey?: string };
  organizationId: string;
  projectInstruction?: string | null;
  projectId: string;
};

const DEFAULT_REPHRASE_MODEL = process.env.REPHRASE_MODEL || 'gemini-2.5-flash';
const parsedRephraseTemp = Number(process.env.REPHRASE_TEMPERATURE);
const DEFAULT_REPHRASE_TEMPERATURE = Number.isNaN(parsedRephraseTemp)
  ? 0.5
  : parsedRephraseTemp;

export const initializePublicRagChain = async ({
  settings,
  organizationId,
  projectInstruction,
  projectId,
}: InitializePublicRagChainParams) => {
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
      organizationId,
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

    const [orgMetadata, ragPipelineSettings] = await Promise.all([
      getOrganizationMetadata(organizationId),
      getRagPipelineSettings(organizationId),
    ]);
    let vectorStore: VectorStoreClient;

    if (orgMetadata.vectorStore === 'supabase') {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        organizationId,
        projectId,
      );
    } else if (orgMetadata.vectorStore === 'meilisearch') {
      vectorStore = createMeilisearchVectorStore(
        embeddingModel,
        organizationId,
      );
    } else {
      // Default: Qdrant
      vectorStore = createQdrantVectorStore(embeddingModel, organizationId);
    }

    // Combine org prompt with project instruction if available
    let finalInstructions = answerInstructions || '';
    if (projectInstruction) {
      finalInstructions = `${finalInstructions}\n\n<project_instructions>\n${projectInstruction}\n</project_instructions>`;
    }

    // Public threads must only access project-scoped documents, never global KB
    const isSupabase = orgMetadata.vectorStore === 'supabase';
    const metadataFilter = isSupabase
      ? undefined
      : {
          must: [
            {
              key: 'metadata.organization_id',
              match: {
                value: organizationId,
              },
            },
            {
              key: 'metadata.project_id',
              match: {
                value: projectId,
              },
            },
          ],
        };

    const wrappedStore = wrapVectorStoreWithDualContentDecode(
      vectorStore,
      organizationId,
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
        litellmApiKey,
        answerInstructions: finalInstructions,
        tracking: { organizationId },
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
  projectId: string,
): VectorStoreClient => {
  try {
    // SECURITY CRITICAL: Public threads must only access project-scoped documents.
    // Both organization_id and project_id filters prevent cross-org and cross-project leakage.
    const metadataFilter: Record<string, string> = {
      organization_id: organizationId,
      project_id: projectId,
    };

    return new SupabaseVectorStoreClient(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating vector store');
    throw error;
  }
};
