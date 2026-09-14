import { type CreateMarkdownDocumentParams } from '../../services/db/index.js';
import { db } from '../../services/db/index.js';

export const createMarkdownDocument = async ({
  content,
  orgId,
  projectId,
  title,
  fileId,
}: CreateMarkdownDocumentParams) => {
  return await db.createMarkdownDocument({
    content,
    orgId: orgId,
    projectId: projectId,
    title,
    fileId: fileId,
  });
};
