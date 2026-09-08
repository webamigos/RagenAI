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

  return await db.userDocument.create({
    data: {
      title,
      content: encryptedContent,
      encryptedDek,
      organizationId,
      fileId,
      projectId,
    },
  });
};
