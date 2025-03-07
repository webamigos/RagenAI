import { UserFile } from '@prisma/client';

import db from '@ragenai/prisma-client';
import { getOrgIdOrThrow } from './clerk';
import { SupportedFileType } from './fileParser';

export const getFileDetails = async (fileId: string) => {
  const orgId = getOrgIdOrThrow();
  return await db.userFile.findFirst({
    where: {
      organization_id: orgId,
      id: fileId,
    },
  });
};

export const createFileDetailsInDB = async (
  file_name: string,
  file_size: number,
  organization_id: string,
  id: string,
  file_type: SupportedFileType,
  project_id: number
) => {
  return await db.userFile.create({
    data: {
      id,
      organization_id,
      file_name,
      file_size,
      file_type,
      project_id,
    },
  });
};

export const fetchFileDetails = async (uploaderId: string) => {
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
      project_id: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

export const getOrganizationFilesCount = async (
  organizationId: string
): Promise<number> => {
  const count = await db.userFile.count({
    where: {
      organization_id: organizationId,
    },
  });
  return count;
};

export const deleteFileFromDb = async (orgId: string, documentId: string) => {
  return await db.userFile.deleteMany({
    where: {
      id: documentId,
      organization_id: orgId,
    },
  });
};

export const deleteProjectFile = async (fileId: string, projectId: number) => {
  const orgId = getOrgIdOrThrow();
  return await db.userFile.deleteMany({
    where: {
      id: fileId,
      organization_id: orgId,
      project_id: projectId,
    } as any,
  });
};
