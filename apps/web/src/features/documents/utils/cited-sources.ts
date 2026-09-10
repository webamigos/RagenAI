import type { RetrievedSource } from '@/libs/chains/types/common';
import { parseCitationMarkers } from './citation-markers';

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
export function selectCitedSources(
  retrieved: readonly RetrievedSource[],
  answer: string,
): RetrievedSource[] {
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
  const cited: RetrievedSource[] = [];

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
