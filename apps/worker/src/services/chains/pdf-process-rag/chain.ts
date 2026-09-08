import * as fs from 'fs/promises';
import pdfParse from 'pdf-parse';

import { type Document } from '../../../types/Document';

import {
  convertPDFToImages,
  processPDFInBatches,
  removeDirectory,
} from './operations';

import {
  availableModels,
  PDF_MODEL,
  systemTemplates,
  humanTemplates,
} from './config';

import {
  parseStructuredPdfOutput,
  renderPdfSectionPath,
  updateHeadingStack,
  type PdfSection,
} from './parse-structured-pdf-output';

import { logger } from '../../logger';
import { getChatModelForOrg, generateTextWithPdf } from '../../llm';
import { db, type UserFile } from '../../db';
import { withLangfuseTrace } from '../../langfuse-trace';

export async function processPDFDocument(
  filePath: string,
  fileName: UserFile['fileName'],
  fileId: UserFile['id'],
  organizationId: UserFile['organizationId'],
  projectId: UserFile['projectId'],
): Promise<{ rawDocs: Document[]; success: boolean; message: string }> {
  try {
    const model = await getChatModelForOrg(
      organizationId,
      availableModels.mini,
    );

    const { convertedPages, directory } = await convertPDFToImages(
      filePath,
      fileId,
    );
    const pageDescriptions = await processPDFInBatches(
      convertedPages,
      directory,
      model,
      undefined,
      organizationId,
    );

    let finalDocument = '';
    const rawDocs: Document[] = [];

    pageDescriptions.forEach((description: string, index: number) => {
      finalDocument += description + '\n';
      rawDocs.push({
        pageContent: description,
        metadata: { page: index + 1, type: 'image_description' },
      });
    });

    await db.createMarkdownDocument({
      title: fileName,
      fileId: fileId,
      orgId: organizationId,
      content: finalDocument,
      projectId: projectId,
    });

    // Parse PDF text content using pdf-parse
    const pdfBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text;

    if (pdfText.trim()) {
      // Split by pages (pdf-parse separates pages with form feeds)
      const pages: string[] = pdfText.split(/\f/);
      pages.forEach((pageText: string, index: number) => {
        if (pageText.trim()) {
          rawDocs.push({
            pageContent: pageText.trim(),
            metadata: {
              source: filePath,
              pdf: { totalPages: pdfData.numpages },
              loc: { pageNumber: index + 1 },
            },
          });
        }
      });
    }

    await removeDirectory(directory);
    logger.info(
      `PDF converted to ${convertedPages.length} images and analyzed for file: ${fileName}`,
    );

    // Ensure actual page count is available in metadata for the workflow
    if (pdfData.numpages && rawDocs[0]) {
      rawDocs[0].metadata = {
        ...rawDocs[0].metadata,
        pdf: { totalPages: pdfData.numpages },
      };
    }

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

/**
 * Reconstruct flat markdown text from a validated sections array. Used for
 * the `user_documents.content` UI preview column, which PDF writes
 * directly from its loader (unlike other file types). Produces output
 * shaped like the legacy flat-text extraction so the UI keeps rendering
 * correctly without changes.
 */
function sectionsToFlatMarkdown(sections: PdfSection[]): string {
  return sections
    .map((section) => {
      const heading = section.title.trim();
      if (heading.length === 0) {
        return section.content;
      }
      const hashes = '#'.repeat(section.level);
      return `${hashes} ${heading}\n\n${section.content}`;
    })
    .join('\n\n');
}

/**
 * Build a Document array from the structured Claude output (ADR-18). Each
 * section becomes one Document with the heading-stack path in
 * `metadata.sectionPath`. Sections are passed through unchanged here — the
 * PDF section splitter (see src/services/text-splitters/pdf-section-splitter.ts)
 * handles any that exceed the chunk budget during the splitter dispatch step.
 */
function sectionsToDocuments(
  sections: PdfSection[],
  filePath: string,
): Document[] {
  const headingStack: (string | null)[] = [];
  const docs: Document[] = [];

  for (const section of sections) {
    updateHeadingStack(headingStack, section);

    const content = section.content.trim();
    if (content.length === 0) {
      // Empty sections are dropped — a heading with no body produces no
      // retrievable chunk, but future sections under deeper heading
      // levels still see this heading in the stack for their sectionPath.
      continue;
    }

    const sectionPath = renderPdfSectionPath(headingStack);
    docs.push({
      pageContent: content,
      metadata: {
        source: filePath,
        type: 'claude_pdf_extraction',
        ...(sectionPath ? { sectionPath } : {}),
      },
    });
  }

  return docs;
}

/**
 * Process a PDF using Claude's native PDF support.
 *
 * ADR-18 (Phase 4b) changed the extraction prompt to request STRUCTURED
 * JSON output with a `sections` array instead of flat text. On success,
 * each section becomes a retrieval-grade Document with a `sectionPath`
 * metadata field derived from the heading hierarchy. Long sections are
 * split further by the PDF section splitter in the dispatcher step.
 *
 * Fallback chain when any layer fails:
 *   1. Structured extraction returns empty / malformed JSON / invalid
 *      schema → fall back to the legacy flat-text extraction prompt
 *      (`systemTemplates.pdfExtraction`). Single additional LLM call.
 *   2. Legacy flat-text extraction returns empty → fall back to
 *      pdf-parse raw text extraction.
 *   3. pdf-parse also fails/empty → return success: false.
 *
 * The flat-text fallback costs one extra LLM round-trip only on the
 * rare failure path; happy-path cost is the same as before ADR-18.
 */
export async function processPdfWithClaude(
  filePath: string,
  fileName: UserFile['fileName'],
  fileId: UserFile['id'],
  organizationId: UserFile['organizationId'],
  projectId: UserFile['projectId'],
): Promise<{ rawDocs: Document[]; success: boolean; message: string }> {
  try {
    const pdfBuffer = await fs.readFile(filePath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Extract actual page count early — used by the workflow for page_count column.
    // This is lightweight (no LLM call) and always available.
    let pdfPageCount: number | undefined;
    try {
      const pdfData = await pdfParse(pdfBuffer);
      pdfPageCount = pdfData.numpages;
    } catch {
      // Non-critical — workflow will fall back to rawDocs.length
    }

    const tags = ['pdf-extraction', PDF_MODEL];

    logger.info(
      { fileId, fileName, sizeBytes: pdfBuffer.length },
      'Processing PDF with Claude native support',
    );

    // ==== STEP 1: Ask Claude for structured JSON output ====
    const structuredRaw = await withLangfuseTrace(
      {
        name: 'process-pdf-claude-structured',
        sessionId: organizationId,
        tags: [...tags, 'structured'],
      },
      () =>
        generateTextWithPdf({
          model: PDF_MODEL,
          system: systemTemplates.pdfExtractionStructured,
          pdfBase64,
          prompt: humanTemplates.pdfExtractionStructured,
          orgId: organizationId,
        }),
    );

    const structured = parseStructuredPdfOutput(structuredRaw);
    const rawDocs: Document[] = [];
    let finalDocument = '';

    if (structured !== null) {
      const sectionedDocs = sectionsToDocuments(structured.sections, filePath);
      if (sectionedDocs.length > 0) {
        rawDocs.push(...sectionedDocs);
        finalDocument = sectionsToFlatMarkdown(structured.sections);
        logger.info(
          {
            fileId,
            fileName,
            sectionsCount: structured.sections.length,
            docsCount: sectionedDocs.length,
          },
          'PDF structured extraction succeeded',
        );
      }
    }

    // ==== STEP 2: Fallback to legacy flat-text extraction ====
    if (rawDocs.length === 0) {
      logger.info(
        { fileId, fileName },
        'Structured extraction produced no chunks, falling back to flat-text Claude extraction',
      );

      const flatText = await withLangfuseTrace(
        {
          name: 'process-pdf-claude-flat',
          sessionId: organizationId,
          tags: [...tags, 'flat'],
        },
        () =>
          generateTextWithPdf({
            model: PDF_MODEL,
            system: systemTemplates.pdfExtraction,
            pdfBase64,
            prompt: humanTemplates.pdfExtraction,
            orgId: organizationId,
          }),
      );

      if (flatText.trim()) {
        rawDocs.push({
          pageContent: flatText,
          metadata: { source: filePath, type: 'claude_pdf_extraction' },
        });
        finalDocument = flatText;
      }
    }

    // ==== STEP 3: Last-resort fallback to pdf-parse ====
    if (rawDocs.length === 0) {
      try {
        const pdfData = await pdfParse(pdfBuffer);
        const pages = pdfData.text.split(/\f/);
        pages.forEach((pageText: string, index: number) => {
          if (pageText.trim()) {
            rawDocs.push({
              pageContent: pageText.trim(),
              metadata: {
                source: filePath,
                type: 'pdf_text',
                loc: { pageNumber: index + 1 },
                pdf: { totalPages: pdfData.numpages },
              },
            });
          }
        });
        finalDocument = rawDocs.map((d) => d.pageContent).join('\n\n');
      } catch (parseError) {
        logger.warn(
          { err: parseError },
          'pdf-parse text extraction failed, continuing with whatever we have',
        );
      }
    }

    if (!finalDocument.trim()) {
      logger.warn(
        { fileId, fileName },
        'All PDF extraction strategies produced no content',
      );
      return {
        rawDocs: [],
        success: false,
        message: 'PDF extraction produced no content',
      };
    }

    // Ensure actual page count is available in metadata for the workflow
    if (pdfPageCount != null && rawDocs[0]) {
      rawDocs[0].metadata = {
        ...rawDocs[0].metadata,
        pdf: { totalPages: pdfPageCount },
      };
    }

    await db.createMarkdownDocument({
      title: fileName,
      fileId,
      orgId: organizationId,
      content: finalDocument,
      projectId,
    });

    logger.info(
      { fileId, fileName, docsCount: rawDocs.length },
      'PDF processed with Claude successfully',
    );

    return {
      rawDocs,
      success: true,
      message: 'PDF processed with Claude native support',
    };
  } catch (error) {
    logger.error({ err: error }, 'Error processing PDF with Claude');
    return {
      rawDocs: [],
      success: false,
      message: `Error processing PDF with Claude: ${error}`,
    };
  }
}
