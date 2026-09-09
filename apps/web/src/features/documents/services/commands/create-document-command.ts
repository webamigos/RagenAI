'use server';

import db from '@ragenai/prisma-client';
import type { CreateMarkdownDocumentInput } from '../../contracts/document.types';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
} from '@ragenai/crypto';

export const createDocumentCommand = async ({
  title,
  content,
  organizationId,
  fileId,
  projectId,
}: CreateMarkdownDocumentInput) => {
  let encryptedContent = content;
  let encryptedDek: string | null = null;

  if (isEncryptionEnabled()) {
    const key = await generateThreadKey();
    encryptedContent = encryptContent(content, key.plaintextDek);
    encryptedDek = key.encryptedDek;
  }

  // The document's owner mirrors the file's, so the document keeps its
  // standing when the file is deleted (`file_id` is ON DELETE SET NULL). With
  // no file there is nothing to mirror and `ownerId` stays null, which means
  // org-wide — unchanged for documents authored in the app.
  const file = fileId
    ? await db.userFile.findFirst({
        where: { id: fileId, organizationId },
        select: { ownerId: true },
      })
    : null;

  return await db.userDocument.create({
    data: {
      title,
      content: encryptedContent,
      encryptedDek,
      organizationId,
      fileId,
      projectId,
      ownerId: file?.ownerId ?? null,
    },
  });
};
