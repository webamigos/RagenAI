import type {
  KnowledgeDecisionView,
  KnowledgePageStatus,
} from '../contracts/brain.types';

const EVIDENCE_LINE = /^\d+\.\s/;

/**
 * A page's markdown as the page screen shows it: without its own `# title`
 * (the header has it), without the numbered quotes extraction writes after
 * the last `---` (the sources list below shows each of them, with its file
 * and version), and with every `[n]` linked to the n-th source.
 *
 * Display only: the stored content keeps its quotes, which the review mode,
 * merging and export read. The tail is dropped only when every line in it is
 * a numbered quote, so a page someone edited to use `---` as a rule keeps it.
 */
export function pageBodyForDisplay(
  content: string,
  title: string,
  anchorFor: (marker: number) => string | null,
): string {
  let lines = content.split('\n');
  if (lines[0]?.trim() === `# ${title}`) {
    lines = lines.slice(1);
  }
  const separator = lines.lastIndexOf('---');
  if (separator >= 0) {
    const tail = lines.slice(separator + 1).filter((l) => l.trim() !== '');
    if (tail.length > 0 && tail.every((l) => EVIDENCE_LINE.test(l.trim()))) {
      lines = lines.slice(0, separator);
    }
  }
  return lines
    .join('\n')
    .trim()
    .replace(/\[(\d+)\]/g, (marker, n: string) => {
      const anchor = anchorFor(Number(n));
      return anchor ? `[\\[${n}\\]](#${anchor})` : marker;
    });
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
