import { type Document } from '../../types/Document';

const DEFAULT_SEPARATORS = ['\n\n', '\n', ' ', ''];

type SplitterOptions = {
  chunkSize: number;
  chunkOverlap: number;
  keepSeparator?: boolean;
  separators?: string[];
};

function splitTextWithSeparator(
  text: string,
  separator: string,
  keepSeparator: boolean,
): string[] {
  if (separator === '') {
    return text.split('');
  }

  const parts = text.split(separator);

  if (!keepSeparator) {
    return parts;
  }

  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      result.push(separator + parts[i]);
    } else {
      result.push(parts[i]);
    }
  }
  return result;
}

function mergeSplits(
  splits: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const chunks: string[] = [];
  const currentChunk: string[] = [];
  let currentLength = 0;

  for (const split of splits) {
    if (currentLength + split.length > chunkSize && currentChunk.length > 0) {
      const chunk = currentChunk.join('').trim();
      if (chunk) {
        chunks.push(chunk);
      }

      // Handle overlap - keep trailing splits that fit in overlap
      while (currentLength > chunkOverlap && currentChunk.length > 0) {
        const removed = currentChunk.shift()!;
        currentLength -= removed.length;
      }
    }

    currentChunk.push(split);
    currentLength += split.length;
  }

  const lastChunk = currentChunk.join('').trim();
  if (lastChunk) {
    chunks.push(lastChunk);
  }

  return chunks;
}

function splitTextRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number,
  keepSeparator: boolean,
): string[] {
  const finalChunks: string[] = [];

  let separator = separators[separators.length - 1];
  let newSeparators: string[] = [];

  for (let i = 0; i < separators.length; i++) {
    if (separators[i] === '' || text.includes(separators[i])) {
      separator = separators[i];
      newSeparators = separators.slice(i + 1);
      break;
    }
  }

  const splits = splitTextWithSeparator(text, separator, keepSeparator).filter(
    (s) => s !== '',
  );

  const goodSplits: string[] = [];

  for (const split of splits) {
    if (split.length < chunkSize) {
      goodSplits.push(split);
    } else {
      if (goodSplits.length > 0) {
        const merged = mergeSplits(goodSplits, chunkSize, chunkOverlap);
        finalChunks.push(...merged);
        goodSplits.length = 0;
      }

      if (newSeparators.length === 0) {
        finalChunks.push(split);
      } else {
        const subChunks = splitTextRecursive(
          split,
          newSeparators,
          chunkSize,
          chunkOverlap,
          keepSeparator,
        );
        finalChunks.push(...subChunks);
      }
    }
  }

  if (goodSplits.length > 0) {
    const merged = mergeSplits(goodSplits, chunkSize, chunkOverlap);
    finalChunks.push(...merged);
  }

  return finalChunks;
}

export function splitDocuments(
  docs: Document[],
  options: SplitterOptions,
): Document[] {
  const {
    chunkSize,
    chunkOverlap,
    keepSeparator = true,
    separators = DEFAULT_SEPARATORS,
  } = options;

  const result: Document[] = [];

  for (const doc of docs) {
    const chunks = splitTextRecursive(
      doc.pageContent,
      separators,
      chunkSize,
      chunkOverlap,
      keepSeparator,
    );

    for (const chunk of chunks) {
      result.push({
        pageContent: chunk,
        metadata: { ...doc.metadata },
      });
    }
  }

  return result;
}
