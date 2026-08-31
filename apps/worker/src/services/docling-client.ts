import { readFile } from 'fs/promises';
import { DOCLING_URL } from '../consts';
import { logger } from './logger';

type DoclingConvertResponse = {
  document: {
    md_content: string | null;
  };
  status: 'success' | 'partial_success' | 'skipped' | 'failure';
  errors: string[];
};

type DoclingOptions = {
  /** Output formats to request. Defaults to markdown only. */
  toFormats?: string[];
  /** Enable OCR. Defaults to true. */
  doOcr?: boolean;
  /** Table extraction mode. Defaults to 'accurate'. */
  tableMode?: 'fast' | 'accurate';
  /** Image export mode in markdown. Defaults to 'placeholder'. */
  imageExportMode?: 'placeholder' | 'embedded' | 'referenced';
};

/**
 * Converts a local file to Markdown via the docling-serve REST API.
 *
 * Uses the `/v1/convert/source` endpoint with base64-encoded file content.
 * Returns the Markdown string on success, throws on failure.
 */
export const convertWithDocling = async (
  filePath: string,
  fileName: string,
  options: DoclingOptions = {},
): Promise<string> => {
  const {
    toFormats = ['md'],
    doOcr = true,
    tableMode = 'accurate',
    imageExportMode = 'placeholder',
  } = options;

  const fileBuffer = await readFile(filePath);
  const base64String = fileBuffer.toString('base64');

  const url = `${DOCLING_URL}/v1/convert/source`;

  logger.info(
    { fileName, url, doOcr, tableMode },
    'Sending file to Docling for conversion',
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      options: {
        to_formats: toFormats,
        do_ocr: doOcr,
        table_mode: tableMode,
        image_export_mode: imageExportMode,
        do_table_structure: true,
      },
      sources: [
        {
          kind: 'file',
          base64_string: base64String,
          filename: fileName,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw new Error(
      `Docling conversion failed (HTTP ${response.status}): ${errorText}`,
    );
  }

  const result = (await response.json()) as DoclingConvertResponse;

  if (result.status === 'failure' || result.status === 'skipped') {
    throw new Error(
      `Docling conversion ${result.status}: ${result.errors?.join(', ') || 'unknown error'}`,
    );
  }

  if (result.status === 'partial_success') {
    logger.warn(
      { fileName, errors: result.errors },
      'Docling conversion partially succeeded — some content may be missing',
    );
  }

  const markdown = result.document?.md_content;

  if (!markdown || markdown.trim().length === 0) {
    throw new Error('Docling returned empty markdown content');
  }

  logger.info(
    {
      fileName,
      status: result.status,
      markdownLength: markdown.length,
    },
    'Docling conversion completed',
  );

  return markdown;
};

/**
 * Health check for docling-serve. Returns true if the service is reachable
 * and ready.
 */
export const isDoclingAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${DOCLING_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
};
