import {
  fileAccessWhere as coreFileAccessWhere,
  type DocumentActor,
} from '@ragenai/rag-core';

import type { Prisma } from '@/generated/prisma/client';

export type { DocumentActor };

/**
 * The single definition of "which files may this actor read" is in rag-core
 * (`fileAccessWhere`), so `apps/api` composes the same rule rather than a
 * second spelling of it. This hands it to this app's Prisma client.
 */
export function fileAccessWhere(
  actor: DocumentActor,
): Prisma.UserFileWhereInput {
  return coreFileAccessWhere(actor) as Prisma.UserFileWhereInput;
}
