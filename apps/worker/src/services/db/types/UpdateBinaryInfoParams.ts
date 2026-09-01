import { type UserFile } from './UserFile';

export type UpdateBinaryInfoParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organization_id'] };
  data: {
    isBinary: boolean;
  };
};
