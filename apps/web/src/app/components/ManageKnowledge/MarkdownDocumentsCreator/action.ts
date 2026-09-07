'use server';

import { randomUUID } from 'node:crypto';
import TurndownService from 'turndown';

import {
  getCurrentUserId,
  getOrgIdFromAuthOrThrow,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import { assertCanManageDocuments } from '@/features/subscriptions/services/feature-guards';
import { type DocumentSchema } from './DocumentCreator';
import { logger } from '@/app/lib/utils/logger';

type DocumentPreviewItem = {
  content: string;
  title: string;
  file: { id: string; fileType: string; fileExtension: string | null } | null;
};

/**
 * Every action in this file derives the organization from the session rather
 * than accepting one, and that is the whole point of the change that
 * introduced this comment.
 *
 * All three used to take an organization id as an argument and hand it
 * straight to `ragenApiRequest`, which passes it to `issueSessionToken()`.
 * That function signs whatever it is given — its payload is
 * `{ userId, orgId, exp }` with no membership check — and `apps/api`'s
 * `SessionAuthGuard` verifies only the signature, so
 * `POST /v1/internal/documents` trusted `context.orgId` outright. Nothing
 * anywhere in that chain asked whether the signed-in user belonged to the
 * organization named.
 *
 * This module carries `'use server'` and is imported by client components, so
 * Next exposes each exported async function as a callable endpoint — including
 * `saveMarkdownWithMeta`, which no code calls. Any signed-in user could
 * therefore read a document from, or write one into, an organization they
 * have nothing to do with, by supplying its id.
 *
 * Do not reintroduce the parameter for convenience. `getOrgIdFromAuthOrThrow`
 * is the rule for every server action here (see AGENTS.md, "Server Actions —
 * Security"); a caller-supplied tenant id is the cross-org IDOR this
 * repository has already been bitten by more than once.
 */
export async function saveMarkdownWithMeta(data: DocumentSchema) {
  const organizationId = await getOrgIdFromAuthOrThrow();

  // Writing a markdown document into the knowledge base is a corpus change,
  // and this is a user-facing entry point rather than ingest machinery. It
  // reaches neither upload nor delete — the two paths the write restrictions
  // gated — so a frozen organization could still author here.
  await assertCanManageDocuments(organizationId);
  const uniqueFileId = randomUUID();
  const turndownService = new TurndownService();
  const markdownContent = turndownService.turndown(data.content);
  const markdownData = {
    id: uniqueFileId,
    title: data.title,
    content: markdownContent,
    organizationId: organizationId,
  };
  const markdownDataSize = new TextEncoder().encode(
    JSON.stringify(markdownData.content),
  ).length;

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Unauthorized');
    }
    await ragenApiRequest({
      method: 'POST',
      path: '/v1/internal/documents',
      userId,
      orgId: organizationId,
      body: {
        title: markdownData.title,
        content: markdownData.content,
      },
    });
    return {
      success: true,
      document: {
        id: uniqueFileId,
        title: data.title,
        fileSize: markdownDataSize,
        organizationId: organizationId,
        fileName: data.title,
        createdAt: new Date(),
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create document');
    return { success: false, message: 'Failed to create document:', error };
  }
}

type DocumentFile = {
  id: string;
  fileType: string;
  fileExtension: string | null;
} | null;

type DocumentSuccessResponse = {
  success: true;
  documents: { content: string; title: string; file: DocumentFile }[];
};

type DocumentErrorResponse = {
  success: false;
  message: string;
  error: unknown;
};

type DocumentResponse = DocumentSuccessResponse | DocumentErrorResponse;

export async function fetchDocumentByOrganization(
  documentId: string,
): Promise<DocumentResponse> {
  try {
    const organizationId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Unauthorized');
    }
    const response = await ragenApiRequest<DocumentPreviewItem[]>({
      method: 'GET',
      path: `/v1/internal/documents/${encodeURIComponent(documentId)}/preview`,
      userId,
      orgId: organizationId,
    });

    return {
      success: true,
      documents: response,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch documents');
    return {
      success: false,
      message: 'Failed to fetch documents',
      error,
    };
  }
}

type UpdateDocumentTitleProps = {
  documentId: string;
  title: string;
  content?: string;
};

type UpdateSuccessResponse = {
  success: true;
  message: string;
};

type UpdateErrorResponse = {
  success: false;
  message: string;
  error: unknown;
};

type UpdateResponse = UpdateSuccessResponse | UpdateErrorResponse;

export const updateDocument = async ({
  documentId,
  title,
  content,
}: UpdateDocumentTitleProps): Promise<UpdateResponse> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Unauthorized');
    }
    await assertCanManageDocuments(orgId);
    if (!content) {
      await ragenApiRequest({
        method: 'PUT',
        path: `/v1/internal/documents/${encodeURIComponent(documentId)}/title`,
        userId,
        orgId,
        body: { title },
      });
    }
    if (content) {
      await ragenApiRequest({
        method: 'PUT',
        path: `/v1/internal/documents/${encodeURIComponent(documentId)}/content`,
        userId,
        orgId,
        body: { content },
      });
    }

    return {
      success: true,
      message: 'Document updated successfully',
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to update document');
    return {
      success: false,
      message: 'Failed to update document',
      error,
    };
  }
};
