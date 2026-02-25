import db from '@ragenai/prisma-client';
import type { ApiContext } from '../types/ApiContext';
import { parseResponse } from '../filters/replace-ids.filter';

export async function getApiDocumentsQuery(context: ApiContext) {
  const documents = await db.userDocument.findMany({
    where: {
      organization_id: context.orgId,
    },
    select: {
      public_id: true,
      title: true,
      created_at: true,
      updated_at: true,
      file: {
        select: {
          public_id: true,
          file_name: true,
          file_size: true,
          created_at: true,
          file_type: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  return parseResponse(documents);
}

export async function getApiDocumentQuery(
  context: ApiContext,
  publicId: string
) {
  const document = await db.userDocument.findFirst({
    where: {
      organization_id: context.orgId,
      public_id: publicId,
    },
    select: {
      public_id: true,
      title: true,
      created_at: true,
      updated_at: true,
      file: {
        select: {
          public_id: true,
          file_name: true,
          file_size: true,
          created_at: true,
          file_type: true,
        },
      },
    },
  });

  return parseResponse(document);
}
