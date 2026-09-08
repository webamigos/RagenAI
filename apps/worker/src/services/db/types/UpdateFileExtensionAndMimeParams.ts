import { type UserFile } from './UserFile';

export type UpdateFileExtensionAndMimeParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organizationId'] };
  data: {
    ext: string | undefined;
    mime: string;
  };
};
