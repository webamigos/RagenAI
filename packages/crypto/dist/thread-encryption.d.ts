/** Whether envelope encryption is available in this process. */
export declare function isEncryptionEnabled(): boolean;
/**
 * Generate a DEK for a thread. The wrapped form is stored on the row; the
 * plaintext is used immediately and never persisted.
 */
export declare function generateThreadKey(): Promise<{
  encryptedDek: string;
  plaintextDek: Buffer;
}>;
export declare function decryptThreadKey(
  encryptedDekBase64: string,
): Promise<Buffer>;
/** Drop every cached DEK. Call at the end of request processing. */
export declare function clearDekCache(): void;
/**
 * Encrypt several message bodies under one thread key, generating the key if
 * the thread does not have one yet.
 */
export declare function encryptMessages(
  messages: {
    content: string;
  }[],
  existingEncryptedDek?: string,
): Promise<{
  encryptedContents: string[];
  encryptedDek: string;
}>;
/** Decrypt several message bodies under one thread key. */
export declare function decryptMessages(
  encryptedContents: string[],
  encryptedDek: string,
): Promise<string[]>;
/**
 * Decrypt the bodies of a thread's messages in place.
 *
 * Decryption is attempted whenever a DEK is present, regardless of whether
 * encryption is currently *enabled* — turning the feature off must not make
 * existing conversations unreadable.
 */
export declare function decryptMessageContents<
  T extends {
    content: string;
  },
>(messages: T[], encryptedDek: string | null | undefined): Promise<T[]>;
/** Decrypt a document body, or return it unchanged when it has no DEK. */
export declare function decryptDocumentContent(
  content: string,
  encryptedDek: string | null | undefined,
): Promise<string>;
//# sourceMappingURL=thread-encryption.d.ts.map
