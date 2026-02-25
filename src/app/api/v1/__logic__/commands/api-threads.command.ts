import db from '@ragenai/prisma-client';
import OpenAI from 'openai';
import { Source } from '@/generated/prisma/client';
import type { ApiContext } from '../types/ApiContext';
import { parseResponse } from '../filters/replace-ids.filter';
import { NotFoundException } from '../services/api-errors.service';
import type { UpdateThreadDto } from '../dtos/update-thread.dto';
import { getApiUserThreadQuery } from '../queries/api-threads.query';

// TODO: decouple from OpenAI
export async function createApiUserThreadCommand(context: ApiContext) {
  const openai = new OpenAI();

  // TODO: move creation of Open AI thread to first message
  const thread = await openai.beta.threads.create();

  const threadRecord = await db.thread.create({
    data: {
      organization_id: context.orgId,
      project_id: context.projectId,
      user_id: context.userId,
      source: Source.API,
    },
  });

  return {
    id: threadRecord.public_id,
  };
}

export async function updateApiUserThreadCommand(
  context: ApiContext,
  publicId: string,
  payload: UpdateThreadDto
) {
  const record = await getApiUserThreadQuery(context, publicId);

  if (!record) {
    throw new NotFoundException();
  }

  const updatedThread = await db.thread.update({
    where: {
      public_id: publicId,
      organization_id: context.orgId,
      project_id: context.projectId,
      OR: [{ user_id: context.userId }, { visitor_id: context.userId }],
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

  return parseResponse(updatedThread);
}

export async function deleteApiUserThreadCommand(
  context: ApiContext,
  publicId: string
) {
  const record = await getApiUserThreadQuery(context, publicId);

  if (!record) {
    throw new NotFoundException();
  }

  await db.thread.delete({
    where: {
      public_id: publicId,
      organization_id: context.orgId,
      project_id: context.projectId,
      OR: [{ user_id: context.userId }, { visitor_id: context.userId }],
    },
  });
}
