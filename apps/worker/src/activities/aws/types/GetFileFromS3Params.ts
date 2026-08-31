import { UserFile } from '../../../services/db/types';

export type GetFileFromS3Params = {
  orgId: UserFile['organization_id'];
  fileId: UserFile['id'];
  fileName: UserFile['file_name'];
};
