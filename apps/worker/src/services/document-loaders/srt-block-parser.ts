/**
 * SRT block parser + segment→block matcher (ADR-17).
 *
 * Used by the SRT loader to recover timestamp information after LLM
 * semantic segmentation (parse-srt-to-segments.ts). The LLM returns text
 * segments without timestamps; we match each segment back to the original
 * SRT blocks via substring search and compute min/max timestamps from the
 * matched blocks.
 *
 * Exported individually for unit testability.
 */

export type SrtBlock = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type SegmentTimestamps = {
  // camelCase to match the loader metadata convention; prepareMetadata
  // maps these to `timestamp_start_ms` / `timestamp_end_ms` when building
  // the canonical Qdrant metadata shape (ADR-17).
  timestampStartMs: number;
  timestampEndMs: number;
};

/**
 * Parse an SRT file into a list of timestamped blocks.
 *
 * SRT format:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:05,000
 * Hello world
 *
 * 2
 * 00:00:06,000 --> 00:00:10,000
 * Second line
 * ```
 *
 * Handles CRLF/LF, both comma and dot as millisecond separators, and
 * multi-line text within a block. Malformed blocks are skipped silently.
 */
export function parseSrtBlocks(raw: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  // Split on blank lines (with optional whitespace)
  const blockTexts = raw.split(/\r?\n\s*\r?\n/);

  for (const blockText of blockTexts) {
    const lines = blockText.trim().split(/\r?\n/);
    if (lines.length < 3) {
      continue;
    }

    const index = parseInt(lines[0].trim(), 10);
    if (!Number.isFinite(index)) {
      continue;
    }

    const timingMatch = lines[1].match(
      /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/,
    );
    if (!timingMatch) {
      continue;
    }

    const startMs = srtTimingToMs(
      timingMatch[1],
      timingMatch[2],
      timingMatch[3],
      timingMatch[4],
    );
    const endMs = srtTimingToMs(
      timingMatch[5],
      timingMatch[6],
      timingMatch[7],
      timingMatch[8],
    );

    const text = lines.slice(2).join(' ').trim();
    if (text.length === 0) {
      continue;
    }

    blocks.push({ index, startMs, endMs, text });
  }

  return blocks;
}

function srtTimingToMs(
  hours: string,
  minutes: string,
  seconds: string,
  milliseconds: string,
): number {
  return (
    parseInt(hours, 10) * 3600000 +
    parseInt(minutes, 10) * 60000 +
    parseInt(seconds, 10) * 1000 +
    parseInt(milliseconds, 10)
  );
}

/**
 * Normalize text for loose substring matching: lowercase, collapse
 * whitespace. Used when matching LLM segments back to SRT blocks.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * For a given LLM segment, find which SRT blocks it spans and return the
 * min/max timestamps. Returns undefined if no blocks can be confidently
 * matched — caller should treat this as "unknown timestamps" and leave
 * the metadata fields unset.
 *
 * Matching strategy:
 * 1. Exact substring of normalized block text inside normalized segment.
 * 2. If no exact match and block text is longer than 20 chars, try
 *    matching the first 20 chars as a prefix (handles minor LLM edits).
 */
export function findSegmentTimestamps(
  segment: string,
  blocks: SrtBlock[],
): SegmentTimestamps | undefined {
  const segmentNormalized = normalize(segment);
  if (segmentNormalized.length === 0 || blocks.length === 0) {
    return undefined;
  }

  const matched: SrtBlock[] = [];

  for (const block of blocks) {
    const blockNormalized = normalize(block.text);
    if (blockNormalized.length === 0) {
      continue;
    }

    if (segmentNormalized.includes(blockNormalized)) {
      matched.push(block);
      continue;
    }

    if (blockNormalized.length >= 20) {
      const prefix = blockNormalized.slice(0, 20);
      if (segmentNormalized.includes(prefix)) {
        matched.push(block);
      }
    }
  }

  if (matched.length === 0) {
    return undefined;
  }

  let startMs = matched[0].startMs;
  let endMs = matched[0].endMs;
  for (const block of matched) {
    if (block.startMs < startMs) {
      startMs = block.startMs;
    }
    if (block.endMs > endMs) {
      endMs = block.endMs;
    }
  }

  return { timestampStartMs: startMs, timestampEndMs: endMs };
}
