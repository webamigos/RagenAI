export interface StorageProvider {
  upload(key: string, content: Buffer): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  downloadToFile(key: string, destPath: string): Promise<void>;
}
