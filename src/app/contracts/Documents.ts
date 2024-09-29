import { usersDocuments as usersDocumentsModel } from '@prisma/client';

export type usersDocuments = {
  id: usersDocumentsModel['id'];
  visitor_id: usersDocumentsModel['visitor_id'];
  file_name: usersDocumentsModel['file_name'];
  file_size: usersDocumentsModel['file_size'];
  created_at?: usersDocumentsModel['created_at'];
  updated_at?: usersDocumentsModel['updated_at'];
  metadata?: usersDocumentsModel['metadata'];
};
