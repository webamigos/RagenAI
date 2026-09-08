import { type UserFile } from './UserFile';

export type CreateMarkdownDocumentParams = {
  title: string;
  content: string;
  orgId: UserFile['organizationId'];
  projectId: UserFile['projectId'];
  fileId?: UserFile['id']; // because can add without uploading a file
};
