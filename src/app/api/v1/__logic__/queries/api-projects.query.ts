import db from '@ragenai/prisma-client';
import type { ApiContext } from '../types/ApiContext';
import { parseResponse } from '../filters/replace-ids.filter';

export async function getApiUserProjectQuery(
  context: ApiContext,
  publicId: string
) {
  const project = await db.project.findFirst({
    where: {
      public_id: publicId,
      organization_id: context.orgId,
      owner_id: context.userId,
    },
    select: {
      public_id: true,
      title: true,
      source: true,
      created_at: true,
    },
  });

  return parseResponse(project);
}

export async function getApiUserProjectsQuery(context: ApiContext) {
  const projects = await db.project.findMany({
    where: {
      organization_id: context.orgId,
      owner_id: context.userId,
    },
    select: {
      public_id: true,
      title: true,
      created_at: true,
      updated_at: true,
      is_public: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  return parseResponse(projects);
}
