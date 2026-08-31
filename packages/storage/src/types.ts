/**
 * Storage abstraction shared by ragen-app, apps/api and apps/worker (ADR-27).
 *
 * The worker writes the files the app serves, so both sides must agree on how a
 * key maps to an object. Unlike the vector contract in `@ragenai/rag-core`, a
 * disagreement here fails loudly — a missing file raises — which is why this was
 * allowed to exist as two diverging copies for as long as it did.
 */
export interface StorageProvider {
  upload(key: string, content: Buffer): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * Stream an object straight to a path on disk.
   *
   * Exists so the ingest pipeline can hand a large document to a parser without
   * first buffering the whole thing in memory.
   */
  downloadToFile(key: string, destPath: string): Promise<void>;
}

export type StorageProviderName = 's3' | 'local';
