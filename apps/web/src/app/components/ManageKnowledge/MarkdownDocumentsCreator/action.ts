'use server';

import { randomUUID } from 'node:crypto';
import TurndownService from 'turndown';

import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import { type DocumentSchema } from './DocumentCreator';
import { logger } from '@/app/lib/utils/logger';

type DocumentPreviewItem = {
  content: string;
  title: string;
  file: { id: string; fileType: string; fileExtension: string | null } | null;
};

export async function saveMarkdownWithMeta(
  data: DocumentSchema,
  organizationId: string,
) {
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
  organizationId: string,
  documentId: string,
): Promise<DocumentResponse> {
  try {
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
  orgId: string;
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
  orgId,
  documentId,
  title,
  content,
}: UpdateDocumentTitleProps): Promise<UpdateResponse> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Unauthorized');
    }
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
