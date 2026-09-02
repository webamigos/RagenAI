import { type EmbeddingStatus, type UserFile } from './UserFile';

export type UpdateEmbeddingStatusParams = {
  where: { fileId: UserFile['id']; orgId: UserFile['organization_id'] };
  data: {
    embedding_status: EmbeddingStatus;
  };
};
