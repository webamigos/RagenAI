import { db, type UserDocument, type UserFile } from '../../services/db';

export async function bindFileWithDocument({
  fileId,
  documentId,
  orgId,
}: {
  fileId: UserFile['id'];
  documentId: UserDocument['id'];
  orgId: UserFile['organization_id'];
}) {
  return await db.bindFileWithDocument(fileId, documentId, orgId);
}
