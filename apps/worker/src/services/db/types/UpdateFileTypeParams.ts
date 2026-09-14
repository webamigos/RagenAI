import { type FileType, type UserFile } from './UserFile.js';

export type UpdateFileTypeParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organizationId'] };
  data: {
    type: FileType;
  };
};
