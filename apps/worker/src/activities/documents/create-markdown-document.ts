import { CreateMarkdownDocumentParams } from '../../services/db';
import { db } from '../../services/db';

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
