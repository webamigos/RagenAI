import { type UserFile } from './UserFile';

export type UpdateFileSizeParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organization_id'] };
  data: {
    fileSize: number;
  };
};
