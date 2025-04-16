import db from '@ragenai/prisma-client';
import { getOrgIdOrThrow } from './clerk';

import { fetchOrganizationDefaultProjectId } from './project';
import { FileType, UserFile } from '@prisma/client';

export const getFileDetailsByPublicId = async (
  publicFileId: UserFile['public_id']
) => {
  const orgId = getOrgIdOrThrow();
  return await db.userFile.findFirst({
    where: {
      organization_id: orgId,
      public_id: publicFileId,
    },
  });
};

export const createFileDetailsInDB = async (
  file_name: string,
  file_size: number,
  organization_id: string,
  file_type: FileType,
  project_id: number
) => {
  return await db.userFile.create({
    data: {
      organization_id,
      file_name,
      file_size,
      file_type,
      project_id,
    },
  });
};

export const fetchFilesDetails = async (organizationId: string) => {
  const defaultProjectId = await fetchOrganizationDefaultProjectId(
    organizationId
  );

  return await db.userFile.findMany({
    where: {
      organization_id: organizationId,
      project_id: defaultProjectId,
    },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      file_type: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      public_id: true,
      project_id: true,
      document: {
        select: {
          public_id: true,
        },
      },
      project: {
        select: {
          title: true,
          id: true,
        },
      },
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

export const deleteFileFromDb = async (filePublicId: string) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userFile.deleteMany({
    where: {
      public_id: filePublicId,
      organization_id: orgId,
    },
  });
};

export const deleteProjectFile = async (
  publicFileId: string,
  projectId: number
) => {
  const orgId = getOrgIdOrThrow();
  return await db.userFile.deleteMany({
    where: {
      public_id: publicFileId,
      organization_id: orgId,
      project_id: projectId,
    },
  });
};
