// Ported from ragen-app's src/libs/db/constants/vectorStore.ts (only the
// constant initializeBasicRag needs).
export const DOCUMENT_SEARCH_QUERY_NAME = 'match_documents';

export interface VectorStoreDocument {
  pageContent: string;
  metadata: Record<string, any>;
}

export interface VectorStoreClient {
  similaritySearch(
    query: string,
    k: number,
    filter?: object,
  ): Promise<VectorStoreDocument[]>;

  addDocuments(documents: VectorStoreDocument[]): Promise<void>;

  deleteDocuments?(filter: object): Promise<void>;
}
