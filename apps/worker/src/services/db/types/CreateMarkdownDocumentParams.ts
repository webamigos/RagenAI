import { type UserFile } from './UserFile';

export type CreateMarkdownDocumentParams = {
  title: string;
  content: string;
  orgId: UserFile['organization_id'];
  projectId: UserFile['project_id'];
  fileId?: UserFile['id']; // because can add without uploading a file
};
