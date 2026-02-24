import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { OrganizationSettings } from '@/app/lib/types/settings';
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
import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { QdrantVectorStoreClient } from '@/libs/vector-store/qdrant-client';
import { SupabaseVectorStoreClient } from '@/libs/vector-store/supabase-client';
import { getOrganizationMetadata } from '@/app/actions';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';

const serviceName = 'initializeBasicRag';

type InitializeRagChainParams = {
  settings: OrganizationSettings;
  projectInstruction?: string | null;
  internalProjectId: number;
  threadDocuments?: ThreadDocumentUI[];
};

const DEFAULT_REPHRASE_MODEL = 'gpt-4o';
const DEFAULT_REPHRASE_TEMPERATURE = 0.5;

export const initializeRagChain = async ({
  settings,
  projectInstruction,
  internalProjectId,
  threadDocuments,
}: InitializeRagChainParams) => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    setSentryServiceTag(serviceName);

    if (!orgId) {
      throw new Error('Invalid organization');
    }

    const {
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
      prompt: answerInstructions,
      maxDocumentsToRetrieve,
    } = settings;

    setSentryContext('CHAIN_DATA', {
      answerModel,
      answerTemperature,
      answerInstructions,
      maxDocumentsToRetrieve,
      hasProjectInstruction: !!projectInstruction,
    });

    const embeddingModel = createEmbeddingsInstance({ apiKey });
    const contentModerator = createModerationInstance({ apiKey });

    const questionRephraser = createChatCompletionInstance({
      apiKey,
      model: DEFAULT_REPHRASE_MODEL,
      temperature: DEFAULT_REPHRASE_TEMPERATURE,
    });
    const answerGenerator = createChatCompletionInstance({
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
    });

    const orgMetadata = await getOrganizationMetadata(orgId);
    let vectorStore: VectorStoreClient;
    let isQdrant = false;

    if (orgMetadata.privateMetadata?.vector_store === 'qdrant') {
      vectorStore = createQdrantVectorStore(embeddingModel, orgId);
      isQdrant = true;
    } else {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        orgId,
        internalProjectId
      );
    }

    //DOCUMENT FILTERING BY PROJECT_ID
    if (!internalProjectId) {
      throw new Error('Internal project ID is required');
    }

    const filterOptions = isQdrant
      ? {
          must: [
            {
              key: 'metadata.project_id',
              match: {
                value: internalProjectId,
              },
            },
          ],
        }
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
        // QdrantVectorStore needs filter passed to similaritySearch()
        metadataFilter: filterOptions,
        maxDocumentsToRetrieve,
        answerInstructions: answerInstructions || '',
        projectInstruction: projectInstruction || '',
        threadDocuments: threadDocuments || [],
      },
      vectorStore,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing basic RAG chain');
    throw error;
  }
};

const createQdrantVectorStore = (
  embeddingModel: EmbeddingsProvider,
  collectionName: string
): VectorStoreClient => {
  logger.info('creating qdrant vector store', {
    url: process.env.QDRANT_URL,
    collectionName,
  });

  return new QdrantVectorStoreClient(embeddingModel, {
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY,
    collectionName,
  });
};

const createSupabaseVectorStore = (
  client: SupabaseClient,
  embeddingModel: EmbeddingsProvider,
  organizationId: string,
  projectId?: number
): VectorStoreClient => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(organizationId);

    // SECURITY CRITICAL: This organization_id filter is the primary security boundary
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
