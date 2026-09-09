'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.isEncryptionEnabled = isEncryptionEnabled;
exports.generateThreadKey = generateThreadKey;
exports.decryptThreadKey = decryptThreadKey;
exports.clearDekCache = clearDekCache;
exports.encryptMessages = encryptMessages;
exports.decryptMessages = decryptMessages;
exports.decryptMessageContents = decryptMessageContents;
exports.decryptDocumentContent = decryptDocumentContent;
const envelope_1 = require('./envelope');
const key_provider_1 = require('./key-provider');
/** Whether envelope encryption is available in this process. */
function isEncryptionEnabled() {
  return (0, key_provider_1.isEncryptionConfigured)();
}
/**
 * Generate a DEK for a thread. The wrapped form is stored on the row; the
 * plaintext is used immediately and never persisted.
 */
async function generateThreadKey() {
  return (0, key_provider_1.getKeyProvider)().generateDataKey();
}
/**
 * Unwrapped DEKs, cached by their wrapped form.
 *
 * Rendering a thread decrypts every message with the same key, so without
 * this each message would be a KMS round trip. The cache is process-wide and
 * unbounded, which is why `clearDekCache()` exists and why a long-lived
 * process should call it — the entries are plaintext key material.
 */
const dekCache = new Map();
async function decryptThreadKey(encryptedDekBase64) {
  const cached = dekCache.get(encryptedDekBase64);
  if (cached) {
    return cached;
  }
  const plaintext = await (0, key_provider_1.getKeyProvider)().decryptDataKey(
    encryptedDekBase64,
  );
  dekCache.set(encryptedDekBase64, plaintext);
  return plaintext;
}
/** Drop every cached DEK. Call at the end of request processing. */
function clearDekCache() {
  dekCache.clear();
}
/**
 * Encrypt several message bodies under one thread key, generating the key if
 * the thread does not have one yet.
 */
async function encryptMessages(messages, existingEncryptedDek) {
  let dek;
  let encryptedDek;
  if (existingEncryptedDek) {
    dek = await decryptThreadKey(existingEncryptedDek);
    encryptedDek = existingEncryptedDek;
  } else {
    const key = await generateThreadKey();
    dek = key.plaintextDek;
    encryptedDek = key.encryptedDek;
  }
  return {
    encryptedContents: messages.map((msg) =>
      (0, envelope_1.encryptContent)(msg.content, dek),
    ),
    encryptedDek,
  };
}
/** Decrypt several message bodies under one thread key. */
async function decryptMessages(encryptedContents, encryptedDek) {
  const dek = await decryptThreadKey(encryptedDek);
  return encryptedContents.map((content) =>
    (0, envelope_1.decryptContent)(content, dek),
  );
}
/**
 * Decrypt the bodies of a thread's messages in place.
 *
 * Decryption is attempted whenever a DEK is present, regardless of whether
 * encryption is currently *enabled* — turning the feature off must not make
 * existing conversations unreadable.
 */
async function decryptMessageContents(messages, encryptedDek) {
  if (!encryptedDek || messages.length === 0) {
    return messages;
  }
  const dek = await decryptThreadKey(encryptedDek);
  return messages.map((msg) => ({
    ...msg,
    content: (0, envelope_1.decryptContent)(msg.content, dek),
  }));
}
/** Decrypt a document body, or return it unchanged when it has no DEK. */
async function decryptDocumentContent(content, encryptedDek) {
  if (!encryptedDek) {
    return content;
  }
  const dek = await decryptThreadKey(encryptedDek);
  return (0, envelope_1.decryptContent)(content, dek);
}
//# sourceMappingURL=thread-encryption.js.map
