'use server';

import { randomUUID } from 'node:crypto';
import TurndownService from 'turndown';

import {
  createMarkdownDocument,
  getDocumentPreview,
  saveEditedDocumentContent,
  saveEditedDocumentTitle,
} from '@/app/lib/services/document';
import { type DocumentSchema } from './DocumentCreator';
import { logger } from '@/app/lib/utils/logger';

const serviceName = 'MarkdownDocumentsCreator';

export async function saveMarkdownWithMeta(
  data: DocumentSchema,
  organizationId: string
) {
  const uniqueFileId = randomUUID();
  const turndownService = new TurndownService();
  const markdownContent = turndownService.turndown(data.content);
  const markdownData = {
    public_id: uniqueFileId,
    title: data.title,
    content: markdownContent,
    organization_id: organizationId,
  };
  const markdownDataSize = new TextEncoder().encode(
    JSON.stringify(markdownData.content)
  ).length;

  try {
    createMarkdownDocument(markdownData);
    return {
      success: true,
      document: {
        id: uniqueFileId,
        title: data.title,
        file_size: markdownDataSize,
        organization_id: organizationId,
        file_name: data.title,
        created_at: new Date(),
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create document');
    return { success: false, message: 'Failed to create document:', error };
  }
}

type DocumentSuccessResponse = {
  success: true;
  documents: { content: string; title: string }[];
};

type DocumentErrorResponse = {
  success: false;
  message: string;
  error: unknown;
};

type DocumentResponse = DocumentSuccessResponse | DocumentErrorResponse;

export async function fetchDocumentByOrganization(
  organizationId: string,
  documentPublicId: string
): Promise<DocumentResponse> {
  try {
    const response: { content: string; title: string }[] =
      await getDocumentPreview({
        orgId: organizationId,
        documentPublicId,
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
    if (!content) {
      await saveEditedDocumentTitle({ orgId, documentId, title });
    }
    if (content) {
      await saveEditedDocumentContent({ orgId, documentId, content });
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
