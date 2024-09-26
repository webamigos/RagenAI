import db from '@salesyy/prisma-client';

export const createDocumentDetailsInDB = async (
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

export const fetchUserDocumentsDetails = async (uploaderId: string) => {
  return await db.usersDocuments.findMany({
    where: { visitor_id: uploaderId },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      updated_at: true,
      metadata: true,
      visitor_id: true,
      id: true,
    },
  });
};
