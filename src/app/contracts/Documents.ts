import { UserFile } from '@prisma/client';
import { Project } from '@prisma/client';

export type ProjectType = {
  id: Project['id'];
  title: Project['title'];
};

export type UserFileType = {
  id: UserFile['id'];
  public_id: UserFile['public_id'];
  organization_id: UserFile['organization_id'];
  file_name: UserFile['file_name'];
  file_size: UserFile['file_size'];
  created_at?: UserFile['created_at'];
  updated_at?: UserFile['updated_at'];
  metadata?: UserFile['metadata'];
  file_type: UserFile['file_type'];
  project_id: UserFile['project_id'];
  project: ProjectType | null;
};
