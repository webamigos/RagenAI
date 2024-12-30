import * as fs from 'node:fs';
import path from 'path';
import { fromPath } from 'pdf2pic';
import { logger } from '@/app/lib/utils/logger';
import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import {
  PDF_IMAGE_CONFIG,
  PDF_PROCESSING_CONFIG,
  systemTemplates,
  humanTemplates,
} from './config';
import { RunnableSequence } from '@langchain/core/runnables';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export async function describeImageWithLLM(
  imagePath: string,
  chatInstance: BaseChatModel
): Promise<string> {
  try {
    logger.info(`Processing PDF, describe image path: ${imagePath}`);

    const imageBase64 = await readFile(imagePath, 'base64');
    const messages = [
      new SystemMessage(systemTemplates.imageAnalysis),
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: humanTemplates.imageDescription,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
        ],
      }),
    ];

    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages(messages),
      chatInstance,
      new StringOutputParser(),
    ]).withConfig({
      runName: 'Describe Image',
    });

    const response = await chain.invoke({});
    return response || 'No description generated.';
  } catch (error) {
    logger.error({ err: error }, 'Error describing image with LLM');
    return `Error describing image: ${error}`;
  }
}

const openai = new OpenAI();

export const removeDirectory = async (directoryPath: string) => {
  try {
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
    logger.info(`Directory removed: ${directoryPath}`);
  } catch (error) {
    logger.error({ err: error }, `Error removing directory: ${directoryPath}`);
    throw error;
  }
};

export const processPDFInBatches = async (
  convertedPages: any[],
  directory: string,
  chatInstance: BaseChatModel,
  batchSize: number = PDF_PROCESSING_CONFIG.batchSize
) => {
  logger.info(`Processing PDF in batches with size: ${batchSize}`);
  const pageDescriptions: string[] = [];
  const batches = [];

  for (let i = 0; i < convertedPages.length; i += batchSize) {
    batches.push(convertedPages.slice(i, i + batchSize));
  }

  for (const [batchIndex, batch] of batches.entries()) {
    logger.info(`Processing batch ${batchIndex + 1} of ${batches.length}`);
    const batchDescriptions = await Promise.all(
      batch.map(async (page) => {
        const imagePath = path.join(directory, `page.${page.page}.png`);
        return await describeImageWithLLM(imagePath, chatInstance);
      })
    );
    pageDescriptions.push(...batchDescriptions);
  }

  return pageDescriptions;
};

export const convertPDFToImages = async (filePath: string, fileId: string) => {
  const directory = path.join(process.cwd(), 'public', 'pdf_images', fileId);
  await fs.promises.mkdir(directory, { recursive: true });

  const pdf2picOptions = {
    ...PDF_IMAGE_CONFIG,
    savePath: directory,
  };

  const storeAsImage = fromPath(filePath, pdf2picOptions);
  return {
    convertedPages: await storeAsImage.bulk(-1),
    directory,
  };
};
