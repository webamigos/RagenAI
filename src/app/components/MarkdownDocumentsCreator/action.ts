'use server';

import TurndownService from 'turndown';
import { v4 as uuidv4 } from 'uuid';

import {
  createMarkdownDocument,
  getDocumentPreview,
  saveEditedDocumentContent,
  saveEditedDocumentTitle,
} from '@/app/lib/services/document';
import { type DocumentSchema } from './DocumentCreator';
import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { Sentry } from 'pino-sentry';

const serviceName = 'MarkdownDocumentsCreator';

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
    setSentryClerkOrganizationTag(organizationId);
    setSentryServiceTag(serviceName);
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
    Sentry.captureException(error);
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
  documentId: string
): Promise<DocumentResponse> {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(organizationId);
    setSentryContext('EXTRA_DATA', { documentId });
    const response: { content: string; title: string }[] =
      await getDocumentPreview({
        orgId: organizationId,
        documentId,
      });

    return {
      success: true,
      documents: response,
    };
  } catch (error) {
    Sentry.captureException(error);
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
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);
    setSentryContext('EXTRA_DATA', { documentId });
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
    Sentry.captureException(error);
    return {
      success: false,
      message: 'Failed to update document',
      error,
    };
  }
};
