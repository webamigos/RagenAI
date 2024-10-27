'use server';

import TurndownService from 'turndown';

import { createMarkdownDocument } from '@/app/lib/services/document';

import { type DocumentSchema } from './DocumentCreator';

export async function createDocumentAction(
  data: DocumentSchema,
  organizationId: string
) {
  const turndownService = new TurndownService();
  const markdownContent = turndownService.turndown(data.content);

  const markdownData = {
    title: data.title,
    content: markdownContent,
    organization_id: organizationId,
  };

  try {
    createMarkdownDocument(markdownData);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Failed to create document:', error };
  }
}
