import db from '@ragenai/prisma-client';

export type SupportedFileType =
  | 'pdf'
  | 'epub'
  | 'csv'
  | 'markdown'
  | 'unknown'
  | 'text';

export const createDocumentDetailsInDB = async (
  file_name: string,
  file_size: number,
  organization_id: string,
  id: string,
  file_type: SupportedFileType
) => {
  await db.userFile.create({
    data: {
      id,
      organization_id,
      file_name,
      file_size,
      file_type,
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
      file_type: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      id: true,
    },
  });
};

export const deleteDocumentFromUserFile = async (
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

type UpdateDocumentTitleProps = {
  orgId: string;
  documentId: string;
  title?: string;
  content?: string;
};

export const saveEditedDocumentTitle = async ({
  orgId,
  documentId,
  title,
}: UpdateDocumentTitleProps) => {
  await db.userDocument.updateMany({
    where: {
      organization_id: orgId,
      public_id: documentId,
    },
    data: {
      title,
      updated_at: new Date(),
    },
  });
  await db.userFile.updateMany({
    where: {
      organization_id: orgId,
      id: documentId,
    },
    data: {
      file_name: title,
      updated_at: new Date(),
    },
  });
};

export const saveEditedDocumentContent = async ({
  orgId,
  documentId,
  content,
}: UpdateDocumentTitleProps) => {
  await db.userDocument.updateMany({
    where: {
      organization_id: orgId,
      public_id: documentId,
    },
    data: {
      content,
      updated_at: new Date(),
    },
  });
  await db.userFile.updateMany({
    where: {
      organization_id: orgId,
      id: documentId,
    },
    data: {
      updated_at: new Date(),
    },
  });
};

export const getOrganizationDocumentsCount = async (
  organizationId: string
): Promise<number> => {
  const count = await db.userFile.count({
    where: {
      organization_id: organizationId,
    },
  });
  return count;
};
