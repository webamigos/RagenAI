import { db, type UserDocument, type UserFile } from '../../services/db';

export async function bindFileWithDocument({
  fileId,
  documentId,
}: {
  fileId: UserFile['id'];
  documentId: UserDocument['id'];
}) {
  return await db.bindFileWithDocument(fileId, documentId);
}
