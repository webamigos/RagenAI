import { type ParsingStatus, type UserFile } from './UserFile.js';

export type UpdateParsingStatusParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organizationId'] };
  data: {
    parsing_status: ParsingStatus;
  };
};
