import { type UserDocument } from '@/generated/prisma/client';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../utils/auth-helpers';

export const getDocumentById = async (documentId: UserDocument['id']) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.findFirst({
    where: {
      organization_id: orgId,
      id: documentId,
    },
  });
};

export const getDocumentByPublicId = async (
  documentPublicId: UserDocument['public_id']
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.findFirst({
    where: {
      organization_id: orgId,
      public_id: documentPublicId,
    },
    include: {
      file: true,
    },
  });
};

export const deleteDocumentFromDb = async (documentId: UserDocument['id']) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.deleteMany({
    where: {
      id: documentId,
      organization_id: orgId,
    },
  });
};

type CreateMarkdownDocumentProps = {
  public_id: string;
  title: string;
  content: string;
  organization_id: string;
  file_id?: string;
  project_id?: number;
};

export const createMarkdownDocument = async ({
  public_id,
  title,
  content,
  organization_id,
  file_id,
  project_id,
}: CreateMarkdownDocumentProps) => {
  return await db.userDocument.create({
    data: {
      public_id,
      title,
      content,
      organization_id,
      file_id,
      project_id,
    },
  });
};

type getDocumentPreviewProps = {
  orgId: string;
  documentPublicId: string;
};

export const getDocumentPreview = async ({
  orgId,
  documentPublicId,
}: getDocumentPreviewProps) => {
  return await db.userDocument.findMany({
    where: {
      organization_id: orgId,
      public_id: documentPublicId,
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
};
