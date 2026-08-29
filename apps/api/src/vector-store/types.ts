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
