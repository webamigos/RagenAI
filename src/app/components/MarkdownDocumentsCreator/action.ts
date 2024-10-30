'use server';

import TurndownService from 'turndown';
import { v4 as uuidv4 } from 'uuid';

import {
  createMarkdownDocument,
  getDocumentPreview,
} from '@/app/lib/services/document';
import { createDocumentDetailsInDB } from '@/app/lib/services/document';
import { type DocumentSchema } from './DocumentCreator';

export async function saveMarkdownWithMeta(
  data: DocumentSchema,
  organizationId: string
) {
  const uniqueFileId = uuidv4();
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
    createDocumentDetailsInDB(
      data.title,
      markdownDataSize,
      organizationId,
      uniqueFileId
    );
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
    return { success: false, message: 'Failed to create document:', error };
  }
}

type DocumentSuccessResponse = {
  success: true;
  documents: { content: string }[];
};

type DocumentErrorResponse = {
  success: false;
  message: string;
  error: unknown;
};

type DocumentResponse = DocumentSuccessResponse | DocumentErrorResponse;

export async function fetchDocumentByOrganization(
  organizationId: string,
  documentId: string
): Promise<DocumentResponse> {
  try {
    const response: { content: string }[] = await getDocumentPreview({
      orgId: organizationId,
      documentId,
    });

    return {
      success: true,
      documents: response,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch documents',
      error,
    };
  }
}
