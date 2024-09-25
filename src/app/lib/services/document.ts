import db from '@salesyy/prisma-client';

export const saveDocumentDetailsInDB = async (
  file_name: string,
  file_size: number,
  visitor_id: string,
  id: string
) => {
  await db.usersDocuments.create({
    data: {
      id,
      visitor_id,
      file_name,
      file_size,
    },
  });
};
