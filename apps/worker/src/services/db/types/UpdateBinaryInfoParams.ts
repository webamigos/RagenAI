import { type UserFile } from './UserFile';

export type UpdateBinaryInfoParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organizationId'] };
  data: {
    isBinary: boolean;
  };
};
