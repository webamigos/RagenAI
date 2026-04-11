import { z } from 'zod';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import type { ModerationInstance } from '@/app/lib/services/llm';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { ModerationError } from '../errors';

export const normalizeAndSanitizeText = (input: string) => {
  return input
    .replace(/[^\S\n]+/g, ' ') // Replace multiple whitespaces (except newlines) with a single space
    .replace(/\n+/g, '\n') // Replace multiple newlines with a single newline
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{S}\n]/gu, '') // Allow letters, numbers, punctuation, spaces, and symbols
    .normalize('NFKC') // Normalize Unicode characters
    .trim(); // Remove leading and trailing whitespace
};

/**
 * Render retrieved chunks into the context block fed to the answer LLM.
 *
 * Each chunk is wrapped in a `<chunk>` element that surfaces source
 * metadata the LLM can use for citation (ADR-19). The wrapper includes:
 *   - `file` — the source document name (from `metadata.file_name`)
 *   - `section` — heading-aware section path for DOCX/PDF chunks
 *     (from `metadata.section_path`, set by ADR-17 and ADR-18)
 *   - `type` — only set for synthetic summary chunks (`chunk_type: 'summary'`
 *     from ADR-16), so the LLM can treat them as topic overviews rather
 *     than verbatim excerpts
 *
 * The wrapper attributes are omitted when the corresponding metadata field
 * is missing or empty — e.g., chunks from MARKDOWN/TEXT files have no
 * section and render as `<chunk file="notes.md">…</chunk>`. Chunks with no
 * `file_name` metadata at all (legacy, edge cases) fall back to the bare
 * pageContent with no wrapper, preserving the pre-ADR-19 behavior so
 * nothing regresses.
 *
 * Attributes are XML-escaped (`&`, `<`, `>`, `"`) so metadata values with
 * those characters don't break the wrapper — rare in practice but worth
 * handling so the LLM never sees malformed XML.
 */
export const combineDocuments = (docs: VectorStoreDocument[]) => {
  return docs.map(renderDocumentChunk).join('\n\n');
};

function renderDocumentChunk(doc: VectorStoreDocument): string {
  const content = doc.pageContent;
  const metadata = (doc.metadata || {}) as Record<string, unknown>;

  const fileName =
    typeof metadata.file_name === 'string' ? metadata.file_name : undefined;
  const sectionPath =
    typeof metadata.section_path === 'string'
      ? metadata.section_path
      : undefined;
  const chunkType = metadata.chunk_type === 'summary' ? 'summary' : undefined;

  // Bare-content fallback for chunks with no file_name metadata.
  // Matches the pre-ADR-19 behavior so legacy chunks are unaffected.
  if (!fileName) {
    return content;
  }

  const attrs: string[] = [`file="${escapeXmlAttribute(fileName)}"`];
  if (sectionPath && sectionPath.trim().length > 0) {
    attrs.push(`section="${escapeXmlAttribute(sectionPath)}"`);
  }
  if (chunkType) {
    attrs.push(`type="${chunkType}"`);
  }

  return `<chunk ${attrs.join(' ')}>\n${content}\n</chunk>`;
}

/**
 * Escape XML attribute characters so metadata values containing `"`, `<`,
 * `>`, or `&` don't break the wrapper. This is defensive — section_path
 * values like `"Chapter 3 > 3.2 Revenue"` contain a literal `>` which
 * becomes `&gt;` inside the attribute.
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const zodUserInputValidator = (input: string, maxLength: number) => {
  const schema = z.object({
    question: z.string().min(1).max(maxLength),
  });

  return schema.parse({ question: input });
};

//Very naive implementation, consider using a more sophisticated approach like history summarization
export const limitChatHistory = (
  history: string | undefined,
  limit: number,
) => {
  return history ? history.slice(-limit) : undefined;
};

export function partitionThreadDocuments(docs: ThreadDocumentUI[]): {
  textDocs: ThreadDocumentUI[];
  imageDocs: ThreadDocumentUI[];
} {
  const textDocs: ThreadDocumentUI[] = [];
  const imageDocs: ThreadDocumentUI[] = [];
  for (const doc of docs) {
    if (doc.imageData) {
      imageDocs.push(doc);
    } else {
      textDocs.push(doc);
    }
  }
  return { textDocs, imageDocs };
}

export function buildUserMessageWithImages(
  humanMessage: string,
  imageDocuments?: ThreadDocumentUI[],
):
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> {
  if (!imageDocuments || imageDocuments.length === 0) {
    return humanMessage;
  }
  const content: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string }
  > = [{ type: 'text', text: humanMessage }];
  for (const imgDoc of imageDocuments) {
    if (imgDoc.imageData) {
      content.push({ type: 'image', image: imgDoc.imageData });
    }
  }
  return content;
}

export const runModeration = async (
  moderationInstance: ModerationInstance,
  contentToModerate: string,
): Promise<void> => {
  const { results } = await moderationInstance.invoke({
    input: contentToModerate,
  });

  const moderationResult = results[0];
  if (!moderationResult) {
    throw new ModerationError('No results returned from moderation model');
  }

  if (moderationResult.flagged) {
    throw new ModerationError();
  }
};
