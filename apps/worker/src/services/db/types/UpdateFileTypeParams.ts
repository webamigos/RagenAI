import { type FileType, type UserFile } from './UserFile';

export type UpdateFileTypeParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organization_id'] };
  data: {
    type: FileType;
  };
};
