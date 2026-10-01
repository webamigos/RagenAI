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

  /**
   * A file's prose chunks at the given `chunk_index` positions, in file order,
   * within the search's own filter (spec 2026-09-29-llm-document-selection,
   * B2). A position with no chunk is absent. Qdrant only — the one supported
   * store (ADR-31).
   */
  getChunksByIndex?(
    orgId: string,
    fileId: string,
    indexes: readonly number[],
    filter?: object,
  ): Promise<VectorStoreDocument[]>;
}
