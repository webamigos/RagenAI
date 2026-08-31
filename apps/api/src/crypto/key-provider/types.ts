export interface KeyProvider {
  /**
   * Generate a new data encryption key (DEK) for envelope encryption.
   * Returns the encrypted (wrapped) DEK for storage and the plaintext DEK for immediate use.
   */
  generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }>;

  /**
   * Decrypt (unwrap) a previously encrypted DEK back to plaintext.
   */
  decryptDataKey(encryptedDek: string): Promise<Buffer>;
}
