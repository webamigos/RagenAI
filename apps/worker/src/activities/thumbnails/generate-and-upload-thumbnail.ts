import { createReadStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { createInterface } from 'readline';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { PDFiumLibrary } from '@hyzyla/pdfium';

import { aws } from '../../services/aws';
import { logger } from '../../services/logger';
import { FileType } from '../../types/UserFile';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

const THUMBNAIL_WIDTH = 600;

function getFontPath(): string {
  // Try multiple possible locations
  const candidates = [
    path.resolve(process.cwd(), 'public/fonts/JetBrainsMono-Regular.ttf'),
    path.resolve(__dirname, '../../../public/fonts/JetBrainsMono-Regular.ttf'),
    path.resolve(__dirname, '../../public/fonts/JetBrainsMono-Regular.ttf'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Font file not found. Searched: ${candidates.join(', ')}`);
}

type GenerateAndUploadThumbnailParams = FileLocator & {
  fileType: FileType;
};

async function generatePdfThumbnail(filePath: string): Promise<Buffer> {
  const pdfBuffer = await readFile(filePath);
  const library = await PDFiumLibrary.init();
  let document: Awaited<ReturnType<typeof library.loadDocument>> | undefined;

  try {
    document = await library.loadDocument(pdfBuffer);

    let rendered: { data: Buffer } | undefined;
    for (const page of document.pages()) {
      rendered = await page.render({
        scale: 2,
        render: async (options: {
          width: number;
          height: number;
          data: Uint8Array;
        }) => {
          return await sharp(options.data, {
            raw: {
              width: options.width,
              height: options.height,
              channels: 4,
            },
          })
            .png()
            .toBuffer();
        },
      });
      break; // Only render first page
    }

    if (!rendered) {
      throw new Error('PDF has no pages');
    }

    return await sharp(rendered.data)
      .resize({ width: THUMBNAIL_WIDTH })
      .png()
      .toBuffer();
  } finally {
    if (document) document.destroy();
    library.destroy();
  }
}

async function readHeadLines(
  filePath: string,
  maxLines: number,
): Promise<string[]> {
  const lines: string[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    lines.push(line);
    if (lines.length >= maxLines) {
      break;
    }
  }

  stream.destroy();
  return lines;
}

async function generateTextThumbnail(filePath: string): Promise<Buffer> {
  const width = THUMBNAIL_WIDTH;
  const height = Math.round(width * 1.4);
  const padding = 32;
  const fontSize = 13;
  const lineHeight = fontSize * 1.6;
  const maxLines = Math.floor((height - padding * 2) / lineHeight);

  const charsPerLine = Math.floor((width - padding * 2) / (fontSize * 0.6));
  const rawLines = await readHeadLines(filePath, maxLines);
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    if (lines.length >= maxLines) {
      break;
    }
    if (rawLine.length <= charsPerLine) {
      lines.push(rawLine);
    } else {
      let remaining = rawLine;
      while (remaining.length > 0 && lines.length < maxLines) {
        lines.push(remaining.slice(0, charsPerLine));
        remaining = remaining.slice(charsPerLine);
      }
    }
  }

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const textElements = lines
    .map(
      (line, i) =>
        `<text x="${padding}" y="${padding + fontSize + i * lineHeight}" font-family="JetBrains Mono" font-size="${fontSize}" fill="#1a1a1a">${escapeHtml(line)}</text>`,
    )
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="white"/>
    ${textElements}
  </svg>`;

  const fontPath = getFontPath();

  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false,
      defaultFontFamily: 'JetBrains Mono',
    },
  });

  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

export async function generateAndUploadThumbnail({
  orgId,
  fileId,
  fileName,
  fileType,
}: GenerateAndUploadThumbnailParams): Promise<string> {
  logger.info(`Generating thumbnail for file ${fileId} (type: ${fileType})`);

  const filePath = await ensureLocalFile({ orgId, fileId, fileName });

  let thumbnailBuffer: Buffer;

  switch (fileType) {
    case FileType.PDF:
      thumbnailBuffer = await generatePdfThumbnail(filePath);
      break;

    case FileType.MARKDOWN:
    case FileType.TEXT:
    case FileType.SRT:
    case FileType.CSV:
      thumbnailBuffer = await generateTextThumbnail(filePath);
      break;

    case FileType.XLSX:
    case FileType.DOCX:
      // Binary document formats — no text preview available
      throw new Error(
        `Thumbnail generation not supported for ${fileType} files`,
      );

    case FileType.IMAGE:
      thumbnailBuffer = await sharp(filePath)
        .resize({ width: THUMBNAIL_WIDTH })
        .png()
        .toBuffer();
      break;

    default:
      throw new Error(
        `Thumbnail generation not supported for file type: ${fileType}`,
      );
  }

  const s3Key = `${orgId}/thumbnails/${fileId}.png`;

  logger.info(`Uploading thumbnail to S3: ${s3Key}`);

  await aws.uploadRaw(s3Key, thumbnailBuffer);

  return s3Key;
}
