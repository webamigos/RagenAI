import type { VectorStoreDocument } from '@/libs/vector-store/types';

interface TextSplitterOptions {
  chunkSize: number;
  chunkOverlap: number;
  keepSeparator?: boolean;
}

/**
 * Split text using recursive character splitting.
 * Tries to split on larger separators first, falling back to smaller ones.
 */
export function recursiveCharacterSplit(
  text: string,
  options: TextSplitterOptions
): string[] {
  const { chunkSize, chunkOverlap } = options;
  const separators = ['\n\n', '\n', '. ', ' ', ''];

  return splitRecursive(text, separators, chunkSize, chunkOverlap);
}

/**
 * Split markdown text with awareness of markdown structure.
 * Tries to split on markdown headings first, then falls back to regular splitting.
 */
export function markdownSplit(
  text: string,
  options: TextSplitterOptions
): string[] {
  const { chunkSize, chunkOverlap } = options;
  const separators = [
    '\n## ',
    '\n### ',
    '\n#### ',
    '\n##### ',
    '\n###### ',
    '\n\n',
    '\n',
    '. ',
    ' ',
    '',
  ];

  return splitRecursive(text, separators, chunkSize, chunkOverlap);
}

function splitRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  if (text.length <= chunkSize) {
    return text.trim() ? [text] : [];
  }

  const separator = separators[0];
  const remainingSeparators = separators.slice(1);

  let splits: string[];
  if (separator === '') {
    // Last resort: split by characters
    splits = text.split('');
  } else {
    splits = text.split(separator);
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const split of splits) {
    const piece = separator === '' ? split : split;
    const testChunk = currentChunk ? currentChunk + separator + piece : piece;

    if (testChunk.length <= chunkSize) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        if (currentChunk.length <= chunkSize) {
          chunks.push(currentChunk);
        } else if (remainingSeparators.length > 0) {
          // Current chunk is too large, try splitting with next separator
          const subChunks = splitRecursive(
            currentChunk,
            remainingSeparators,
            chunkSize,
            chunkOverlap
          );
          chunks.push(...subChunks);
        } else {
          chunks.push(currentChunk);
        }
      }

      // Start new chunk with overlap
      if (chunkOverlap > 0 && currentChunk) {
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + separator + piece;
      } else {
        currentChunk = piece;
      }
    }
  }

  // Handle the last chunk
  if (currentChunk.trim()) {
    if (currentChunk.length <= chunkSize) {
      chunks.push(currentChunk);
    } else if (remainingSeparators.length > 0) {
      const subChunks = splitRecursive(
        currentChunk,
        remainingSeparators,
        chunkSize,
        chunkOverlap
      );
      chunks.push(...subChunks);
    } else {
      chunks.push(currentChunk);
    }
  }

  return chunks.filter((c) => c.trim());
}

/**
 * Split documents into chunks, preserving metadata.
 */
export function splitDocuments(
  docs: VectorStoreDocument[],
  splitFn: (text: string, options: TextSplitterOptions) => string[],
  options: TextSplitterOptions
): VectorStoreDocument[] {
  const result: VectorStoreDocument[] = [];

  for (const doc of docs) {
    const chunks = splitFn(doc.pageContent, options);
    for (const chunk of chunks) {
      result.push({
        pageContent: chunk,
        metadata: { ...doc.metadata },
      });
    }
  }

  return result;
}
