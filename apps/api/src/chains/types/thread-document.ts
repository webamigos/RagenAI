/**
 * Duplicated from apps/web's
 * src/features/documents/contracts/document.types.ts (the ThreadDocumentUI
 * interface only) — see docs/adrs/21-monorepo-and-api-decoupling.md. Keep in
 * sync manually until a real shared package exists.
 */
export interface ThreadDocumentUI {
  name: string;
  content: string;
  size: number;
  type: string;
  userFileId?: string;
  sourceUrl?: string;
  driveFileId?: string;
  driveModifiedTime?: string;
  imageData?: string; // base64 data URL for image attachments
  documentData?: string; // base64 data URL for binary documents (PDF, EPUB)
}
