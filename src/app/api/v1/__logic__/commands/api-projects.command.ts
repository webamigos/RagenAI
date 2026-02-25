import db from '@ragenai/prisma-client';
import { Source } from '@/generated/prisma/client';
import type { ApiContext } from '../types/ApiContext';
import { parseResponse } from '../filters/replace-ids.filter';
import { NotFoundException } from '../services/api-errors.service';
import type { UpdateProjectDto } from '../dtos/project.dto';
import { getApiUserProjectQuery } from '../queries/api-projects.query';

export async function createApiUserProjectCommand(
  context: ApiContext,
  { title }: { title: string }
) {
  const projectRecord = await db.project.create({
    data: {
      organization_id: context.orgId,
      owner_id: context.userId,
      title,
      source: Source.API,
    },
  });

  return {
    id: projectRecord.public_id,
    title: projectRecord.title,
  };
}

export async function updateApiUserProjectCommand(
  context: ApiContext,
  publicId: string,
  payload: UpdateProjectDto
) {
  const record = await getApiUserProjectQuery(context, publicId);

  if (!record) {
    throw new NotFoundException();
  }

  const updatedProject = await db.project.update({
    where: {
      public_id: publicId,
      organization_id: context.orgId,
      owner_id: context.userId,
    },
    data: {
      title: payload.title,
    },
    select: {
      public_id: true,
      title: true,
      source: true,
      created_at: true,
    },
  });

  return parseResponse(updatedProject);
}
