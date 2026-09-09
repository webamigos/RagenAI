import { readFile } from 'fs/promises';
import { DOCLING_URL } from '../consts';
import { logger } from './logger';

type DoclingConvertResponse = {
  document: {
    md_content: string | null;
    /**
     * The structured `DoclingDocument`. Sent as a JSON string by some
     * docling-serve versions and as an object by others, so both are handled.
     */
    json_content: string | Record<string, unknown> | null;
  };
  status: 'success' | 'partial_success' | 'skipped' | 'failure';
  errors: string[];
};

/** Where a page starts in the markdown. */
export type PageAnchor = {
  /** Character offset into the markdown. */
  offset: number;
  /** 1-based page the text at that offset came from. */
  page: number;
};

export type DoclingConversion = {
  markdown: string;
  /**
   * How many pages the document actually has, straight from the parser.
   *
   * `null` when the format has no such thing — Markdown, plain text and CSV
   * are not paginated, and inventing a number for them would be the same
   * mistake as the char-count estimate this replaces, with more confidence
   * behind it.
   */
  pageCount: number | null;
  /**
   * Where each page begins in the markdown, ascending by offset.
   *
   * Docling reports a page per *element*, and the markdown is one flat string,
   * so this is the bridge: a chunk starting at offset X came from the page of
   * the last anchor at or before X.
   *
   * Sparse on purpose. Only text elements are anchored — tables and pictures
   * live elsewhere in the document and render differently in markdown — and an
   * element whose text cannot be located verbatim is skipped rather than
   * guessed at. Gaps cost nothing: the lookup walks backwards to the last
   * known page, which is the right answer for anything between two anchors.
   */
  pageAnchors: PageAnchor[];
};

/**
 * Locates each text element in the markdown to learn where its page starts.
 *
 * Sequential rather than a global search: the same sentence can occur twice in
 * a document, and the second occurrence is not where the first element lives.
 * Walking forward keeps elements in document order and makes a repeated string
 * match the copy that comes next.
 */
function buildPageAnchors(
  markdown: string,
  jsonContent: DoclingConvertResponse['document']['json_content'],
): PageAnchor[] {
  const parsed = parseJsonContent(jsonContent);
  const texts = (parsed as { texts?: unknown } | null)?.texts;
  if (!Array.isArray(texts)) {
    return [];
  }

  const anchors: PageAnchor[] = [];
  let cursor = 0;
  let lastPage: number | null = null;

  for (const element of texts) {
    const text = (element as { text?: unknown })?.text;
    const prov = (element as { prov?: unknown })?.prov;
    if (typeof text !== 'string' || !Array.isArray(prov) || prov.length === 0) {
      continue;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const page = (prov[0] as { page_no?: unknown })?.page_no;
    if (typeof page !== 'number') {
      continue;
    }

    const offset = markdown.indexOf(trimmed, cursor);
    if (offset === -1) {
      // Headings carry markdown markers, tables are rebuilt, OCR can differ
      // from the extracted string. A miss is expected and harmless.
      continue;
    }
    cursor = offset + trimmed.length;

    // One anchor per page, at its first located element. Anchors within a page
    // add nothing — the lookup only needs to know where each page begins.
    if (page !== lastPage) {
      anchors.push({ offset, page });
      lastPage = page;
    }
  }

  return anchors;
}

/**
 * Reads the page count out of a `DoclingDocument`.
 *
 * `pages` is a map keyed by page number, so its size is the count. Returns
 * null rather than 0 or 1 when the key is missing: "this format has no pages"
 * and "this document has one page" are different answers, and the caller
 * chooses a fallback only for the first.
 */
function parseJsonContent(
  jsonContent: DoclingConvertResponse['document']['json_content'],
): unknown {
  if (!jsonContent) {
    return null;
  }
  if (typeof jsonContent !== 'string') {
    return jsonContent;
  }
  try {
    return JSON.parse(jsonContent);
  } catch {
    // A malformed body is not worth failing an otherwise good conversion
    // for — the markdown is the part ingest cannot do without.
    return null;
  }
}

function readPageCount(
  jsonContent: DoclingConvertResponse['document']['json_content'],
): number | null {
  const parsed = parseJsonContent(jsonContent);
  const pages = (parsed as { pages?: unknown } | null)?.pages;
  if (!pages || typeof pages !== 'object') {
    return null;
  }
  const count = Object.keys(pages).length;
  return count > 0 ? count : null;
}

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
 * Converts a local file via the docling-serve REST API.
 *
 * Uses the `/v1/convert/source` endpoint with base64-encoded file content.
 * Returns the Markdown and the real page count, throws on failure.
 *
 * **Why `json` is requested alongside `md`.** The structured document is where
 * the page count lives, and it is the only place: the markdown is one flat
 * string with no pagination in it. Before this, PDFs parsed by Docling had
 * their page count guessed as `ceil(chars / 3000)` — see the comment this
 * replaced in `parse-and-embed.ts` — and that number feeds usage limits.
 *
 * It is not free: the JSON runs several times the size of the markdown (7.8x
 * on the smallest fixture here). That is worth paying on a Temporal ingest
 * that already runs an LLM over the document, and it is paid once — the same
 * response carries the per-element `prov[].page_no` that a real `source_page`
 * per chunk needs.
 */
export const convertWithDocling = async (
  filePath: string,
  fileName: string,
  options: DoclingOptions = {},
): Promise<DoclingConversion> => {
  const {
    toFormats = ['md', 'json'],
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

  const pageCount = readPageCount(result.document?.json_content);
  const pageAnchors = buildPageAnchors(markdown, result.document?.json_content);

  logger.info(
    {
      fileName,
      status: result.status,
      markdownLength: markdown.length,
      pageCount,
      pageAnchors: pageAnchors.length,
    },
    'Docling conversion completed',
  );

  return { markdown, pageCount, pageAnchors };
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
