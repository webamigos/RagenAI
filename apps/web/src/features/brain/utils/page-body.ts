import type {
  KnowledgeDecisionView,
  KnowledgePageStatus,
} from '../contracts/brain.types';

/** `1. (§2) „quote”` — one line of the evidence extraction writes. */
const EVIDENCE_LINE = /^\d+\.\s+(?:\([^)]*\)\s+)?„([\s\S]*)”$/;

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * A page's markdown as the page screen shows it: without its own `# title`
 * (the header has it) and without the numbered quotes extraction writes after
 * the last `---`, which the sources list below shows with file and version.
 *
 * Display only: the stored content keeps its quotes, which the review mode,
 * merging and export read. The tail is dropped only when every line in it is
 * one of this page's own source quotes, so a numbered list an editor put
 * after a rule stays.
 */
export function pageBodyForDisplay(
  content: string,
  title: string,
  sourceQuotes: readonly string[],
): string {
  let lines = content.split('\n');
  if (lines[0]?.trim() === `# ${title}`) {
    lines = lines.slice(1);
  }
  const separator = lines.lastIndexOf('---');
  if (separator >= 0) {
    const quotes = new Set(sourceQuotes.map(normalize));
    const tail = lines.slice(separator + 1).filter((l) => l.trim() !== '');
    const isEvidence = (line: string) => {
      const match = EVIDENCE_LINE.exec(line.trim());
      return match !== null && quotes.has(normalize(match[1]!));
    };
    if (tail.length > 0 && tail.every(isEvidence)) {
      lines = lines.slice(0, separator);
    }
  }
  return lines.join('\n').trim();
}

/** The few mdast node shapes the marker plugin reads and writes. */
type MdNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
};

/** Nodes whose text is not prose: a marker inside them is left alone. */
const OPAQUE = new Set([
  'link',
  'linkReference',
  'definition',
  'inlineCode',
  'code',
  'html',
]);

const MARKER = /\[(\d+)\]/g;

/**
 * A remark plugin linking each `[n]` in the page's prose to the n-th source,
 * on the syntax tree rather than the text: a marker inside an existing link,
 * inline code or a code block is left as written. A marker with no source
 * stays plain text.
 */
export function remarkSourceMarkers(
  anchorFor: (marker: number) => string | null,
) {
  const split = (node: MdNode): MdNode[] => {
    const value = node.value ?? '';
    const parts: MdNode[] = [];
    let last = 0;
    for (const match of value.matchAll(MARKER)) {
      const anchor = anchorFor(Number(match[1]));
      if (!anchor) {
        continue;
      }
      if (match.index > last) {
        parts.push({ type: 'text', value: value.slice(last, match.index) });
      }
      parts.push({
        type: 'link',
        url: `#${anchor}`,
        children: [{ type: 'text', value: match[0] }],
      });
      last = match.index + match[0].length;
    }
    if (parts.length === 0) {
      return [node];
    }
    if (last < value.length) {
      parts.push({ type: 'text', value: value.slice(last) });
    }
    return parts;
  };
  const walk = (node: MdNode) => {
    if (!node.children || OPAQUE.has(node.type)) {
      return;
    }
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text') {
        return split(child);
      }
      walk(child);
      return [child];
    });
  };
  return () => (tree: unknown) => {
    walk(tree as MdNode);
  };
}

const DECIDED_BY: Partial<
  Record<KnowledgePageStatus, KnowledgeDecisionView['action'][]>
> = {
  APPROVED: ['APPROVE'],
  REJECTED: ['REJECT', 'MERGE'],
};

/**
 * The decision that put the page in its current status, for "Zatwierdzona
 * przez Joe Doe, 4 paź 2026" — or null when no such row exists (a page still
 * to review, or one approved before the ledger). `decisions` is newest first.
 */
export function statusDecision(
  status: KnowledgePageStatus,
  decisions: readonly KnowledgeDecisionView[],
): KnowledgeDecisionView | null {
  const actions = DECIDED_BY[status];
  if (!actions) {
    return null;
  }
  return decisions.find((d) => actions.includes(d.action)) ?? null;
}
