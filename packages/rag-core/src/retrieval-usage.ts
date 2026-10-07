import type { SourceRegion } from './vector-metadata';

/**
 * What the retrieval-usage record needs of a retrieved file, and nothing more.
 * `apps/web`'s `RetrievedSource` satisfies it structurally, so the chain keeps
 * its richer type and this module stays free of the chain.
 */
export interface CitableSource {
  fileId: string;
  fileName: string | null;
  snippet?: string;
  sourcePage?: number;
  sourceRegions?: readonly SourceRegion[];
}

/**
 * The `[n]` markers an answer actually earned.
 *
 * The model is asked to cite by number, and a number is a claim: `[3]` says
 * *this sentence came from the third document you showed me*. Unlike a file
 * name, nothing about the shape of `[3]` says whether it is true — so it is
 * checked against the retrieved set, which is the only thing that can.
 *
 * A marker outside that range is dropped. Gap 2 puts it plainly: a marker
 * pointing at something that was never retrieved is worse than no marker at
 * all, because a reader has no way to tell one from the other.
 */
export type CitationMarkers<S extends CitableSource = CitableSource> = {
  /** Source numbers the answer cited, in ascending order, all valid. */
  numbers: number[];
  /** The corresponding files, for `DocumentCitation` and the sources block. */
  sources: S[];
  /** Markers the answer used that name no retrieved source. */
  invalid: number[];
};

/**
 * `[1]`, `[12]`, and the `[1][3]` run — each bracket is matched separately.
 *
 * Deliberately narrow, because a false positive here *invents* a citation.
 *
 * Digits only, so a footnote (`[^1]`) does not match.
 *
 * The *run* is matched, not each bracket, and only its ends are checked.
 * Everything ruled out here is markdown the model can legitimately write, and
 * each was a real false positive rather than a hypothetical:
 *
 * - `[the docs][1]` — a reference link. Rejected by the preceding `]`.
 *   Matching each bracket separately read it as a citation.
 * - `[1](url)` — an inline link. Rejected by the following `(`.
 * - `[1]: url` — a reference definition. Rejected by the following `:`, but
 *   only when the run opens its line (up to three spaces in), which is the
 *   only place markdown reads a definition. Mid-line, `:` after a run is a
 *   sentence introducing a list — "przedstawiają się następująco [1][2]:" —
 *   and rejecting it there left `[2]` as literal text beside the first chip.
 * - `![1](img)` — an image. Rejected by the preceding `!`.
 *
 * The run is what makes the first rule survivable: `[1][3]` is the documented
 * way to cite two sources for one sentence, and by "preceded by `]`" alone it
 * is indistinguishable from a reference link. Matching the whole run and
 * testing only its ends separates them.
 *
 * The run is also whole: it may not end just before another `[n]`. Without
 * that, `[1][2]: url` opening a line fails the colon rule as a run and the
 * engine backtracks to accept `[1]` alone, counting a definition as a citation.
 *
 * Multiline (`m`), so `^` is the start of a line, not of the answer.
 */
const MARKER_RUN =
  /(?<![\]!])(?:\[\d+\])+(?!\[\d+\])(?!\()(?!(?<=^ {0,3}(?:\[\d+\])+):)/gm;
const DIGITS = /\d+/g;

/**
 * Every number the answer used as a citation marker, valid or not.
 *
 * Exported because the RAG eval needs the same answer to a different
 * question — "did the model invent a source?" — and a second copy of this
 * pattern in `evals/e2e-rag/run.ts` had already drifted: it kept a
 * three-digit cap this one has dropped, so `[1000]` was silently not a
 * marker there and the case it guards passed on a fabricated citation.
 *
 * No cap on digits. A number too large to name a source is still a marker
 * the model wrote, and calling it "not a marker" is how it goes unreported.
 */
export function extractMarkerNumbers(answer: string): number[] {
  return findMarkerRuns(answer).flatMap((run) =>
    run.markers.map((marker) => marker.value),
  );
}

/** One bracket of a run: what it means, and what the model actually typed. */
export type Marker = {
  /** The number it names. */
  value: number;
  /**
   * The bracket exactly as written, `[0009]` and not `[9]`.
   *
   * Kept because `String(Number(text))` is not a round trip: leading zeros
   * are lost, and anything past `Number.MAX_SAFE_INTEGER` comes back a
   * different number or as `Infinity`. A renderer that leaves an unusable
   * marker in place has to put back what was there, not its own rendering of
   * what it parsed.
   */
  text: string;
};

/** One `[1]` or `[1][3]`, and where it sits in the text it came from. */
export type MarkerRun = {
  /** Index of the first `[`. */
  start: number;
  /** Index one past the last `]`. */
  end: number;
  /** Every marker in the run, in the order written. */
  markers: Marker[];
};

/**
 * Where the markers are, not just which ones there are.
 *
 * The renderer needs positions to replace a marker with a chip, and the
 * validator needs numbers. Both come from here so there is exactly one
 * pattern: the last time this was two implementations, the second kept a
 * digit cap the first had dropped, and a case guarding against fabricated
 * citations passed on one.
 */
export function findMarkerRuns(
  text: string,
  {
    opensLine = true,
  }: {
    /**
     * Whether `text` begins a line. A caller holding a fragment that follows
     * other content on the same line — the text after `<strong>Razem</strong>`
     * in rendered HTML — passes `false`, so a `[2]:` at its start is not taken
     * for a reference definition.
     */
    opensLine?: boolean;
  } = {},
): MarkerRun[] {
  // One character that is not a space or a newline keeps `^` from matching
  // the fragment's start, and is subtracted from every index below.
  const offset = opensLine ? 0 : 1;
  const scanned = opensLine ? text : `\u200b${text}`;
  const runs: MarkerRun[] = [];
  for (const match of scanned.matchAll(MARKER_RUN)) {
    const markers: Marker[] = [];
    for (const digits of match[0].matchAll(DIGITS)) {
      markers.push({ value: Number(digits[0]), text: `[${digits[0]}]` });
    }
    runs.push({
      start: match.index - offset,
      end: match.index - offset + match[0].length,
      markers,
    });
  }
  return runs;
}

export function parseCitationMarkers<S extends CitableSource>(
  answer: string,
  sources: readonly S[],
): CitationMarkers<S> {
  const seen = new Set<number>();
  const invalid = new Set<number>();

  for (const n of extractMarkerNumbers(answer)) {
    if (n >= 1 && n <= sources.length) {
      seen.add(n);
    } else {
      invalid.add(n);
    }
  }

  const numbers = [...seen].sort((a, b) => a - b);

  return {
    numbers,
    sources: numbers.map((n) => sources[n - 1]),
    invalid: [...invalid].sort((a, b) => a - b),
  };
}

/**
 * Which of the documents the model was *shown* did it actually *cite*?
 *
 * `DocumentCitation` rows used to be written for every file in the retrieval
 * result — the top-k chunks after dedupe and rerank. With a three-document
 * corpus that is every document, every turn, so the analytics screen reported
 * three "citations" for an answer that named one file. "Cited" meant
 * "retrieved", and the top-cited table was a retrieval-frequency table.
 *
 * There is no structured citation channel to read instead: the answer prompt
 * (`basic-rag/config.ts`) asks the model to write `According to 'file.pdf',
 * …` using the `file` attribute of the chunk it drew on, and that sentence is
 * the only record. So the citation *is* the file name in the answer, and this
 * looks for it — but only among the files that were retrieved. A name the
 * model was never shown cannot be a citation, so the retrieved set is the
 * candidate list and nothing outside it can match.
 *
 * Matching is case-insensitive on the full name, with one concession: models
 * sometimes drop the extension (`'Sample FAQ — support and availability'`),
 * so a long enough stem also counts. The threshold is there because a short
 * stem — `FAQ`, `notes` — is an ordinary word and would match prose that is
 * not a citation. A file whose name never appears is not cited; an answer
 * that cites nothing yields nothing, and that is a signal worth keeping
 * rather than papering over with the retrieved set.
 *
 * Two retrieved files with the same name are both counted when that name is
 * cited. The model cites by name, so the citation is genuinely ambiguous
 * between them; counting both is the honest reading, and each keeps its own
 * `fileId`, so nothing is merged — the rows stay distinct per file.
 */
const MIN_STEM_LENGTH_FOR_EXTENSIONLESS_MATCH = 12;

function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  // No extension, a dotfile, or a "dot" that is part of the name (`v1.2`)
  // — only treat a short trailing segment as an extension.
  if (dot <= 0 || fileName.length - dot > 6) {
    return fileName;
  }
  return fileName.slice(0, dot);
}

function normalize(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/**
 * Which documents the answer cited.
 *
 * **Markers first, names as the fallback.** Since gap 2 stage 2 the answer
 * prompt asks the model to cite by number, and a validated `[n]` carries file
 * identity directly — no ambiguity when two documents share a name, and no
 * dependence on the model happening to spell the name out.
 *
 * Name matching stays for everything that produces no markers: a chunk with
 * no `file_id` gets no `source` attribute and has to be cited by name, an
 * older model may ignore the instruction, and a thread reopened from before
 * this change has answers written the old way.
 *
 * The two are not merged. An answer that used markers has said which
 * documents it used; also scanning it for names would re-add the ambiguity
 * markers exist to remove — a document mentioned in passing is not a
 * citation.
 */
export function selectCitedSources<S extends CitableSource>(
  retrieved: readonly S[],
  answer: string,
): S[] {
  if (retrieved.length === 0 || answer.trim().length === 0) {
    return [];
  }

  // A marker is a claim the answer makes about a specific document, and it
  // has already been checked against the retrieved set. Prefer it.
  const markers = parseCitationMarkers(answer, retrieved);
  if (markers.sources.length > 0) {
    return markers.sources;
  }

  const haystack = normalize(answer);
  const seen = new Set<string>();
  const cited: S[] = [];

  for (const source of retrieved) {
    if (seen.has(source.fileId)) {
      continue;
    }
    const name = source.fileName?.trim();
    if (!name) {
      // A chunk with no file_name metadata (pre-ADR-19 ingest) was rendered
      // bare, so the model had nothing to cite it by.
      continue;
    }

    const fullName = normalize(name);
    const stem = normalize(stemOf(name));
    const matches =
      haystack.includes(fullName) ||
      (stem !== fullName &&
        stem.length >= MIN_STEM_LENGTH_FOR_EXTENSIONLESS_MATCH &&
        haystack.includes(stem));

    if (matches) {
      seen.add(source.fileId);
      cited.push(source);
    }
  }

  return cited;
}

/** One `DocumentRetrieval` row, before the store adds ids and timestamps. */
export interface RetrievalRow {
  fileId: string;
  rank: number;
  snippet: string | null;
  sourcePage?: number;
  sourceRegions?: SourceRegion[];
}

export interface RetrievalUsage {
  retrievals: RetrievalRow[];
  /** File ids the answer cited — the intersection with the answer text. */
  citedFileIds: string[];
}

export interface RetrievalUsageDeps {
  /**
   * The one function the message went through (ADR-42). Injected because the
   * key lives with the thread, in whichever app holds the database client; a
   * snippet protected more weakly than the answer beside it is the bug this
   * seam exists to prevent.
   */
  encryptSnippet(snippet: string): Promise<string>;
  /** Writes both lists in one transaction. */
  writeUsage(usage: RetrievalUsage): Promise<void>;
  /** A quote is the least important thing recorded; losing one is logged. */
  onSnippetEncryptionFailed?(err: unknown): void;
}

/**
 * Record one RAG turn: what the model was shown, and which of it the answer
 * went on to cite. Both, because the difference is the useful part — a
 * document retrieved on every question and never cited is mis-chunked or
 * irrelevant, and against citations alone it looks like one nobody asks about.
 *
 * Cited is not retrieved (#972): the citation is the intersection with the
 * answer text, decided here and never in the chain. `retrieved` arrives deduped
 * by file and in final rank order, so the index is the rank.
 *
 * A snippet that cannot be encrypted is stored as null, never as plaintext:
 * storing it unencrypted beside an encrypted message is the divergence ADR-42
 * forbids, and it would be invisible.
 */
export async function recordRetrievalUsage(
  retrieved: readonly CitableSource[],
  answer: string,
  deps: RetrievalUsageDeps,
): Promise<void> {
  if (retrieved.length === 0) {
    return;
  }
  const cited = selectCitedSources(retrieved, answer);

  // Encrypted before the write opens: encrypting can create the thread's key,
  // and a transaction held across a KMS round-trip is a lock.
  const snippets = await Promise.all(
    retrieved.map(async ({ snippet }) => {
      if (!snippet) {
        return null;
      }
      try {
        return await deps.encryptSnippet(snippet);
      } catch (err) {
        deps.onSnippetEncryptionFailed?.(err);
        return null;
      }
    }),
  );

  await deps.writeUsage({
    retrievals: retrieved.map(
      ({ fileId, sourcePage, sourceRegions }, index) => ({
        fileId,
        rank: index + 1,
        snippet: snippets[index],
        // Omitted, not zeroed, when the parser gave none: absence is what the
        // reader falls back on.
        ...(sourcePage !== undefined ? { sourcePage } : {}),
        ...(sourceRegions !== undefined && sourceRegions.length > 0
          ? { sourceRegions: sourceRegions.map((region) => ({ ...region })) }
          : {}),
      }),
    ),
    citedFileIds: cited.map(({ fileId }) => fileId),
  });
}
