import { type ParsingStatus, type UserFile } from './UserFile';

export type UpdateParsingStatusParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organization_id'] };
  data: {
    parsing_status: ParsingStatus;
  };
};
