import { type EmbeddingStatus, type UserFile } from './UserFile';

export type UpdateEmbeddingStatusParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organizationId'] };
  data: {
    embedding_status: EmbeddingStatus;
  };
};
