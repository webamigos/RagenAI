import { createMarkdownDocument } from '@/app/lib/services/document';
import { logger } from '@/app/lib/utils/logger';
import {
  convertPDFToImages,
  processPDFInBatches,
  removeDirectory,
} from './operations';
import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { availableModels } from './config';
import { getOpenaiAPIKey } from '@/features/organizations/services/organization-settings';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

export async function processPDFDocument(
  filePath: string,
  fileName: string,
  fileId: string,
  organizationId: string,
  projectId?: number
): Promise<{
  rawDocs: VectorStoreDocument[];
  success: boolean;
  message: string;
}> {
  const apiKey = await getOpenaiAPIKey(organizationId);

  try {
    if (!apiKey) {
      throw new Error('OpenAI API key is missing');
    }
    const chatInstance = createChatCompletionInstance({
      apiKey,
      modelName: availableModels.gpt4o,
      streaming: false,
    });

    const { convertedPages, directory } = await convertPDFToImages(
      filePath,
      fileId
    );
    const pageDescriptions = await processPDFInBatches(
      convertedPages,
      directory,
      chatInstance
    );

    let finalDocument = '';
    const rawDocs: VectorStoreDocument[] = [];

    pageDescriptions.forEach((description: string, index: number) => {
      finalDocument += description + '\n';
      rawDocs.push({
        pageContent: description,
        metadata: { page: index + 1, type: 'image_description' },
      });
    });

    await createMarkdownDocument({
      public_id: fileId,
      title: fileName,
      organization_id: organizationId,
      content: finalDocument,
      project_id: projectId,
    });

    // Parse PDF text content using pdf-parse
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const fs = await import('node:fs');
      const pdfBuffer = await fs.promises.readFile(filePath);
      const pdfData = await pdfParse(pdfBuffer);

      if (pdfData.text) {
        // Split by pages if available, otherwise use the whole text
        const textContent = pdfData.text.trim();
        if (textContent) {
          rawDocs.push({
            pageContent: textContent,
            metadata: { type: 'pdf_text', source: filePath },
          });
        }
      }
    } catch (pdfError) {
      logger.warn(
        { err: pdfError },
        'Could not parse PDF text content, using OCR results only'
      );
    }

    await removeDirectory(directory);
    logger.info(
      `PDF converted to ${convertedPages.length} images and analyzed for file: ${fileName}`
    );

    return {
      rawDocs,
      success: true,
      message: 'PDF processed successfully',
    };
  } catch (error) {
    logger.error({ err: error }, 'Error processing PDF document');
    return {
      rawDocs: [],
      success: false,
      message: `Error processing PDF: ${error}`,
    };
  }
}
