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
} from './config';

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

export async function describeImageWithLLM(imagePath: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: systemTemplates.imageAnalysis,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${await readFile(
                  imagePath,
                  'base64'
                )}`,
              },
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content || 'No description generated.';
  } catch (error) {
    logger.error({ err: error }, 'Error describing image with LLM');
    return `Error describing image: ${error}`;
  }
}

export const processPDFInBatches = async (
  convertedPages: any[],
  directory: string,
  batchSize: number = PDF_PROCESSING_CONFIG.batchSize
) => {
  const pageDescriptions: string[] = [];
  const batches = [];

  for (let i = 0; i < convertedPages.length; i += batchSize) {
    batches.push(convertedPages.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const batchDescriptions = await Promise.all(
      batch.map(async (page) => {
        const imagePath = path.join(directory, `page.${page.page}.png`);
        return await describeImageWithLLM(imagePath);
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
