import { type UserFile } from '../../../services/db/types';

export type GetFileFromS3Params = {
  orgId: UserFile['organizationId'];
  fileId: UserFile['id'];
  fileName: UserFile['fileName'];
};
