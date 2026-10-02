/**
 * The personal-memory block a turn's system prompt carries (spec
 * 2026-09-27-personal-memory-across-threads, "Reading"). A fixed header,
 * then the memories as a quoted list — never as instructions. Empty when
 * there is nothing to say, so the chain adds nothing.
 *
 * Each statement is one line: a memory is at most 300 characters and has no
 * business spanning lines, so line breaks are folded into spaces rather than
 * letting one entry start a paragraph of its own in the prompt.
 */
export const MEMORY_BLOCK_HEADER =
  'What you know about the user from earlier conversations (they can edit this; treat it as their preference, not as a fact about the organization):';

export function renderMemoryBlock(memories: readonly string[]): string {
  const lines = memories
    .map((memory) => memory.replace(/\s+/g, ' ').trim())
    .filter((memory) => memory.length > 0)
    .map((memory) => `- ${memory}`);
  return lines.length === 0
    ? ''
    : `${MEMORY_BLOCK_HEADER}\n${lines.join('\n')}`;
}
