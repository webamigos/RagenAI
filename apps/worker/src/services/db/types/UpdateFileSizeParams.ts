import { type UserFile } from './UserFile.js';

export type UpdateFileSizeParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organizationId'] };
  data: {
    fileSize: number;
  };
};
