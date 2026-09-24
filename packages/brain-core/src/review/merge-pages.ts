import { sha256 } from '../text';

/** A source as a page cites it, in the order the page numbers them. */
export type MergeSource = {
  fileId: string;
  documentVersionId: string;
  span: string;
  quote: string;
  hash: string;
};

export type MergeablePage = {
  content: string;
  /** In citation order: the page's `[n]` is `sources[n - 1]`. */
  sources: ReadonlyArray<MergeSource>;
};

export type MergedContent =
  | {
      ok: true;
      content: string;
      contentHash: string;
      /** The absorbed page's sources the target gains, in citation order. */
      addedSources: MergeSource[];
      /** Absorbed claims dropped because the target already cites the quote. */
      duplicates: number;
    }
  | { ok: false; reason: 'unrecognised-content' };

type Parsed = {
  preamble: string[];
  statements: string[];
  evidence: string[];
};

const STATEMENT = /^- (.*) \[(\d+)\]$/;
const EVIDENCE = /^(\d+)\.(.*)$/;

/**
 * Fold one page into another (spec D2b, "merge candidates"): the target keeps
 * its title, description, statements and sources, and gains the absorbed
 * page's claims after them, renumbered so that `[n]` still names the n-th
 * source.
 *
 * **The shape is the one `renderPage` writes**, and nothing else is guessed
 * at: statements `- … [n]` numbered 1…N in order, a `---` line, then evidence
 * `n. …` numbered the same, with N equal to the page's sources. A page in any
 * other shape — hand-written, or from a renderer that changed — is refused as
 * `unrecognised-content` rather than merged into something whose numbers no
 * longer point at the right quote, which is the one thing a reviewer checks.
 *
 * An absorbed claim whose source is one the target already cites — same file,
 * same version, same quote — is dropped: re-extracting a document produces
 * exactly those, and merging them would list the same evidence twice.
 */
export function mergePageContent(
  target: MergeablePage,
  absorbed: MergeablePage,
): MergedContent {
  const into = parse(target);
  const from = parse(absorbed);
  if (!into || !from) {
    return { ok: false, reason: 'unrecognised-content' };
  }

  const cited = new Set(target.sources.map(keyOf));
  const statements = [...into.statements];
  const evidence = [...into.evidence];
  const addedSources: MergeSource[] = [];
  let duplicates = 0;

  absorbed.sources.forEach((source, i) => {
    const key = keyOf(source);
    if (cited.has(key)) {
      duplicates += 1;
      return;
    }
    cited.add(key);
    addedSources.push(source);
    const n = statements.length + 1;
    statements.push(`- ${from.statements[i]} [${n}]`);
    evidence.push(`${n}.${from.evidence[i]}`);
  });

  const content = [
    ...into.preamble,
    '',
    ...into.statements.map((s, i) => `- ${s} [${i + 1}]`),
    ...statements.slice(into.statements.length),
    '',
    '---',
    '',
    ...into.evidence.map((e, i) => `${i + 1}.${e}`),
    ...evidence.slice(into.evidence.length),
    '',
  ].join('\n');

  return {
    ok: true,
    content,
    contentHash: sha256(content),
    addedSources,
    duplicates,
  };
}

/**
 * The page split into its three parts, with the numbers taken off — or null
 * when any part is not what `renderPage` writes.
 */
function parse(page: MergeablePage): Parsed | null {
  const lines = page.content.split('\n');
  const separator = lines.lastIndexOf('---');
  if (separator === -1) {
    return null;
  }
  const head = lines.slice(0, separator);
  const tail = lines.slice(separator + 1).filter((l) => l.trim() !== '');

  const firstStatement = head.findIndex((l) => STATEMENT.test(l));
  if (firstStatement === -1) {
    return null;
  }
  const statementLines = head
    .slice(firstStatement)
    .filter((l) => l.trim() !== '');
  const statements: string[] = [];
  for (const [i, line] of statementLines.entries()) {
    const match = STATEMENT.exec(line);
    if (!match || Number(match[2]) !== i + 1) {
      return null;
    }
    statements.push(match[1]!);
  }

  const evidence: string[] = [];
  for (const [i, line] of tail.entries()) {
    const match = EVIDENCE.exec(line);
    if (!match || Number(match[1]) !== i + 1) {
      return null;
    }
    evidence.push(match[2]!);
  }

  const n = page.sources.length;
  if (statements.length !== n || evidence.length !== n) {
    return null;
  }

  const preamble = head.slice(0, firstStatement);
  while (preamble.length > 0 && preamble[preamble.length - 1]!.trim() === '') {
    preamble.pop();
  }
  return { preamble, statements, evidence };
}

function keyOf(source: MergeSource): string {
  return `${source.fileId}\u0000${source.documentVersionId}\u0000${source.hash}`;
}
