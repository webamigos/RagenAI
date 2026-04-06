'use server';

import db from '@ragenai/prisma-client';
import type { CreateMarkdownDocumentInput } from '../../contracts/document.types';

export const createDocumentCommand = async ({
  title,
  content,
  organizationId,
  fileId,
  projectId,
}: CreateMarkdownDocumentInput) => {
  return await db.userDocument.create({
    data: {
      title,
      content,
      organizationId,
      fileId,
      projectId,
    },
  });
};
