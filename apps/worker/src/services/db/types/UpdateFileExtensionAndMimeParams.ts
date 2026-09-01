import { type UserFile } from './UserFile';

export type UpdateFileExtensionAndMimeParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organization_id'] };
  data: {
    ext: string | undefined;
    mime: string;
  };
};
