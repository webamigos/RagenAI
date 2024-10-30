import db from '@salesyy/prisma-client';

export const createDocumentDetailsInDB = async (
  file_name: string,
  file_size: number,
  organization_id: string,
  id: string
) => {
  await db.userFile.create({
    data: {
      id,
      organization_id,
      file_name,
      file_size,
    },
  });
};

export const fetchUserDocumentsDetails = async (uploaderId: string) => {
  return await db.userFile.findMany({
    where: { organization_id: uploaderId },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      id: true,
    },
  });
};

export const deleteDocumentFromDB = async (
  orgId: string,
  documentId: string
) => {
  return await db.userFile.deleteMany({
    where: {
      id: documentId,
      organization_id: orgId,
    },
  });
};

export const deleteDocumentFromUserDocument = async (
  orgId: string,
  document_id: string
) => {
  return await db.userDocument.deleteMany({
    where: {
      public_id: document_id,
      organization_id: orgId,
    },
  });
};

type CreateMarkdownDocumentProps = {
  public_id: string;
  title: string;
  content: string;
  organization_id: string;
};

export const createMarkdownDocument = async ({
  public_id,
  title,
  content,
  organization_id,
}: CreateMarkdownDocumentProps) => {
  return await db.userDocument.create({
    data: {
      public_id,
      title,
      content,
      organization_id,
    },
  });
};

type getDocumentPreviewProps = {
  orgId: string;
  documentId: string;
};

export const getDocumentPreview = async ({
  orgId,
  documentId,
}: getDocumentPreviewProps) => {
  return await db.userDocument.findMany({
    where: {
      organization_id: orgId,
      public_id: documentId,
    },
    select: {
      content: true,
      title: true,
    },
  });
};
