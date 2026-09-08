export interface KeyProvider {
  /**
   * Generate a new data encryption key for envelope encryption. Returns the
   * wrapped DEK for storage and the plaintext for immediate use.
   */
  generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }>;
  /** Unwrap a previously wrapped DEK. */
  decryptDataKey(encryptedDek: string): Promise<Buffer>;
}
//# sourceMappingURL=types.d.ts.map
