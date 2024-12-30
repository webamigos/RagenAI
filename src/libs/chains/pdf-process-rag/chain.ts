import { Document } from 'langchain/document';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { createMarkdownDocument } from '@/app/lib/services/document';
import { logger } from '@/app/lib/utils/logger';
import {
  convertPDFToImages,
  processPDFInBatches,
  removeDirectory,
} from './operations';
import { createChatCompletionInstance } from '@/app/lib/services/llm';

export async function processPDFDocument(
  filePath: string,
  fileName: string,
  fileId: string,
  organizationId: string
): Promise<{ rawDocs: Document[]; success: boolean; message: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY; // todo!!! use org id!
    if (!apiKey) {
      throw new Error('OpenAI API key is missing');
    }
    const chatInstance = createChatCompletionInstance({
      apiKey,
      modelName: 'gpt-4o', // todo move to the config
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
    const rawDocs: Document[] = [];

    pageDescriptions.forEach((description: string, index: number) => {
      finalDocument += description + '\n';
      rawDocs.push(
        new Document({
          pageContent: description,
          metadata: { page: index + 1, type: 'image_description' },
        })
      );
    });

    await createMarkdownDocument({
      public_id: fileId,
      title: fileName,
      organization_id: organizationId,
      content: finalDocument,
    });

    const pdfLoader = new PDFLoader(filePath);
    const pdfDocs = await pdfLoader.load();
    rawDocs.push(...pdfDocs);

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
