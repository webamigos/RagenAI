'use server';

import db from '@ragenai/prisma-client';
import type { CreateMarkdownDocumentInput } from '../../contracts/document.types';

export const createDocumentCommand = async ({
  public_id,
  title,
  content,
  organization_id,
  file_id,
  project_id,
}: CreateMarkdownDocumentInput) => {
  return await db.userDocument.create({
    data: {
      public_id,
      title,
      content,
      organization_id,
      file_id,
      project_id,
    },
  });
};
