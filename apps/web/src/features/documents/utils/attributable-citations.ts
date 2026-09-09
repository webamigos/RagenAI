import type { ApiSseRetrievedSource } from '@/features/threads/contracts/events.types';

/**
 * Which cited files may be *shown* to the reader as the answer's sources.
 *
 * The server decides citation by looking for a file's name in the answer text
 * (`cited-sources.ts`) — the only signal available until prompted `[n]` markers
 * exist. Names are not unique in this product and never were: two files called
 * `umowa.pdf` in different folders both match one mention.
 *
 * `selectCitedSources` counts both, and that is right where it is used. Its
 * consumer is the analytics tables, which keep a row per `fileId`; a small
 * over-count there is a skew in a number nobody reads as a promise.
 *
 * The sources block is a different claim. Showing both cards tells the reader
 * *this answer came from this document* about a document the model may never
 * have drawn on. So here an ambiguous name attributes to **none** of its
 * candidates rather than all of them: under-attributing is a missing card,
 * over-attributing is a false statement about where an answer came from.
 *
 * The ambiguity disappears on its own once prompted markers land, because a
 * marker carries file identity rather than a name.
 */
export function attributableCitations(
  sources: readonly ApiSseRetrievedSource[],
  citedFileIds: readonly string[],
): Set<string> {
  const cited = new Set(citedFileIds);
  if (cited.size === 0) {
    return new Set();
  }

  // How many *retrieved* files share each name. The retrieved set is the right
  // population: a name is ambiguous when the model could have meant more than
  // one of the documents it was shown, whether or not both were counted.
  const countByName = new Map<string, number>();
  for (const source of sources) {
    const name = normalizeName(source.fileName);
    if (name === null) {
      continue;
    }
    countByName.set(name, (countByName.get(name) ?? 0) + 1);
  }

  const attributable = new Set<string>();
  for (const source of sources) {
    if (!cited.has(source.fileId)) {
      continue;
    }
    const name = normalizeName(source.fileName);
    // A cited file with no name cannot have been cited by name, so something
    // upstream changed; drop it rather than show a nameless card.
    if (name === null) {
      continue;
    }
    if ((countByName.get(name) ?? 0) > 1) {
      continue;
    }
    attributable.add(source.fileId);
  }

  return attributable;
}

function normalizeName(fileName: string | null): string | null {
  const trimmed = fileName?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.normalize('NFC').toLowerCase();
}
