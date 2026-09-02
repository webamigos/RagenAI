import { type Document } from '../../types/Document';
import { splitDocuments } from './recursive-character-text-splitter';

/**
 * DOCX heading-aware splitter (ADR-17).
 *
 * Consumes the HTML output of `mammoth.convertToHtml()` and produces chunks
 * that preserve the document's heading hierarchy as `metadata.section_path`.
 * Paragraphs under the same heading stack are grouped together; when a
 * group exceeds `chunkSize`, it is flushed and a new chunk begins (still
 * under the same heading path).
 *
 * Example `section_path` values:
 *   "Introduction"
 *   "Chapter 3 > 3.2 Revenue"
 *   "Chapter 3 > 3.2 Revenue > Q3 Details"
 *
 * Unusually long single paragraphs (longer than chunkSize) are recursively
 * split using the generic character splitter as a fallback, so they still
 * fit the budget. Each sub-chunk keeps the same section_path.
 *
 * This splitter only processes Mammoth-style HTML (h1-h6, p tags with
 * optional inline formatting). More exotic HTML (tables, lists, images)
 * falls through: list items and table rows are treated as plain paragraphs
 * via regex-based block extraction. Richer handling of lists and tables
 * is deferred.
 */

export type DocxHeadingSplitterOptions = {
  chunkSize: number;
  chunkOverlap: number;
};

type ParsedNode =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string };

/**
 * Strip inline formatting tags (strong, em, u, span, a) and decode HTML
 * entities so the remaining text is plain prose. Mammoth output is
 * well-behaved so we don't need a full HTML parser.
 */
function stripInlineAndDecode(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse Mammoth HTML into a flat list of heading/paragraph nodes. Exported
 * for testing. The parser matches top-level block tags (h1-h6, p, li, th,
 * td) and ignores their containers.
 */
export function parseDocxHtml(html: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  const blockPattern = /<(h[1-6]|p|li|th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    const text = stripInlineAndDecode(inner);
    if (text.length === 0) {
      continue;
    }

    if (tag.length === 2 && tag[0] === 'h') {
      const level = parseInt(tag[1], 10);
      if (level >= 1 && level <= 6) {
        nodes.push({ kind: 'heading', level, text });
        continue;
      }
    }

    nodes.push({ kind: 'paragraph', text });
  }

  return nodes;
}

/**
 * Render a heading stack as a human-readable section path.
 * Returns undefined if the stack is empty (no headings seen yet).
 */
function renderSectionPath(stack: (string | null)[]): string | undefined {
  const filtered = stack.filter((h): h is string => h !== null && h.length > 0);
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.join(' > ');
}

function splitDocxDocument(
  doc: Document,
  options: DocxHeadingSplitterOptions,
): Document[] {
  const nodes = parseDocxHtml(doc.pageContent);
  if (nodes.length === 0) {
    // No parseable blocks — fall back to treating the whole doc as plain
    // text and let the recursive splitter handle it.
    return splitDocuments([doc], {
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
    });
  }

  const chunks: Document[] = [];
  // headingStack[i] holds the text of the most recent heading at level i+1.
  // Slots for levels not yet seen are null, e.g. an h3 under no h2 yields
  // [h1, null, h3].
  const headingStack: (string | null)[] = [];
  let buffer = '';

  const flush = () => {
    const text = buffer.trim();
    buffer = '';
    if (text.length === 0) {
      return;
    }
    const sectionPath = renderSectionPath(headingStack);
    // camelCase `sectionPath` on the intermediate metadata matches the
    // loader convention (fileName, fileType, etc.). prepareMetadata maps
    // it to snake_case `section_path` for the Qdrant payload (ADR-17).
    chunks.push({
      pageContent: text,
      metadata: {
        ...doc.metadata,
        ...(sectionPath ? { sectionPath } : {}),
      },
    });
  };

  for (const node of nodes) {
    if (node.kind === 'heading') {
      // A new heading starts a new logical section — flush the current
      // buffer so the old section_path is attached to it before we update
      // the stack.
      flush();

      // Update heading stack: replace the slot at this level and clear
      // all deeper slots.
      const levelIdx = node.level - 1;
      while (headingStack.length > levelIdx) {
        headingStack.pop();
      }
      while (headingStack.length < levelIdx) {
        headingStack.push(null);
      }
      headingStack.push(node.text);
      continue;
    }

    // paragraph node
    const paragraph = node.text;
    const separator = buffer.length > 0 ? '\n\n' : '';

    // If the paragraph itself is larger than the chunk budget, flush what
    // we have and split the paragraph recursively. Each sub-chunk inherits
    // the current sectionPath.
    if (paragraph.length > options.chunkSize) {
      flush();
      const sectionPath = renderSectionPath(headingStack);
      const sub = splitDocuments(
        [
          {
            pageContent: paragraph,
            metadata: {
              ...doc.metadata,
              ...(sectionPath ? { sectionPath } : {}),
            },
          },
        ],
        {
          chunkSize: options.chunkSize,
          chunkOverlap: options.chunkOverlap,
        },
      );
      chunks.push(...sub);
      continue;
    }

    // Would adding this paragraph overflow the budget? If so, flush first.
    if (
      buffer.length > 0 &&
      buffer.length + separator.length + paragraph.length > options.chunkSize
    ) {
      flush();
    }

    buffer += (buffer.length > 0 ? '\n\n' : '') + paragraph;
  }

  flush();

  return chunks;
}

export function splitDocxDocuments(
  docs: Document[],
  options: DocxHeadingSplitterOptions,
): Document[] {
  return docs.flatMap((doc) => splitDocxDocument(doc, options));
}
