import { UserFile } from '@prisma/client';

export type UserFileType = {
  id: UserFile['id'];
  organization_id: UserFile['organization_id'];
  file_name: UserFile['file_name'];
  file_size: UserFile['file_size'];
  created_at?: UserFile['created_at'];
  updated_at?: UserFile['updated_at'];
  metadata?: UserFile['metadata'];
  file_type: UserFile['file_type'];
  project_id?: UserFile['project_id'];
};
