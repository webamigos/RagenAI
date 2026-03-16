'use server';

import db from '@ragenai/prisma-client';
import type { CreateMarkdownDocumentInput } from '../../contracts/document.types';

export const createDocumentCommand = async ({
  publicId,
  title,
  content,
  organizationId,
  fileId,
  projectId,
}: CreateMarkdownDocumentInput) => {
  return await db.userDocument.create({
    data: {
      publicId,
      title,
      content,
      organizationId,
      fileId,
      projectId,
    },
  });
};
