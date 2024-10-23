export interface VectorStoreDocument {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
}
