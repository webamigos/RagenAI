import * as fs from 'node:fs';
import path from 'path';
import { logger } from '@/app/lib/utils/logger';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import {
  PDF_IMAGE_CONFIG,
  PDF_PROCESSING_CONFIG,
  systemTemplates,
  humanTemplates,
} from './config';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { generateText } from 'ai';
import type { PDFiumPageRenderOptions } from '@hyzyla/pdfium';

async function renderImage(
  options: PDFiumPageRenderOptions,
): Promise<Uint8Array> {
  const buffer = await sharp(options.data, {
    raw: {
      width: options.width,
      height: options.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

export async function describeImageWithLLM(
  imagePath: string,
  chatInstance: LanguageModelV3,
): Promise<string> {
  try {
    logger.info(`Processing PDF, describe image path: ${imagePath}`);

    const imageBase64 = await readFile(imagePath, 'base64');

    const result = await generateText({
      model: chatInstance,
      system: systemTemplates.imageAnalysis,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: humanTemplates.imageDescription,
            },
            {
              type: 'image',
              image: `data:image/png;base64,${imageBase64}`,
            },
          ],
        },
      ],
      experimental_telemetry: { isEnabled: true },
    });

    return result.text || 'No description generated.';
  } catch (error) {
    logger.error({ err: error }, 'Error describing image with LLM');
    return `Error describing image: ${error}`;
  }
}

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
  chatInstance: LanguageModelV3,
  batchSize: number = PDF_PROCESSING_CONFIG.batchSize,
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
      batch.map(async (page: any) => {
        const imagePath = path.join(
          directory,
          `${PDF_IMAGE_CONFIG.saveFilename}${page.page}.png`,
        );
        return await describeImageWithLLM(imagePath, chatInstance);
      }),
    );
    pageDescriptions.push(...batchDescriptions);
  }

  return pageDescriptions;
};

export const convertPDFToImages = async (filePath: string, fileId: string) => {
  const directory = path.join(
    process.cwd(),
    'public',
    'pdf_images',
    String(fileId),
  );
  await fs.promises.mkdir(directory, { recursive: true });

  try {
    const pdfBuffer = await readFile(filePath);
    const library = await PDFiumLibrary.init();
    const document = await library.loadDocument(new Uint8Array(pdfBuffer));

    const convertedPages = [];

    for (const page of document.pages()) {
      logger.info(`Converting page ${page.number} of PDF ${fileId}`);

      const image = await page.render({
        scale: PDF_IMAGE_CONFIG.scale,
        render: renderImage,
      });

      const outputPath = path.join(
        directory,
        `${PDF_IMAGE_CONFIG.saveFilename}${page.number}.png`,
      );
      await fs.promises.writeFile(outputPath, new Uint8Array(image.data));

      convertedPages.push({
        page: page.number,
        path: outputPath,
      });
    }

    document.destroy();
    library.destroy();

    return {
      convertedPages,
      directory,
    };
  } catch (error) {
    logger.error({ err: error }, `Error converting PDF to images: ${filePath}`);
    throw error;
  }
};
