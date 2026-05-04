export type MarkdownSegment = { type: 'markdown'; content: string };
export type MermaidSegment = { type: 'mermaid'; code: string };
export type Segment = MarkdownSegment | MermaidSegment;

const MERMAID_FENCE = /```mermaid[ \t]*\r?\n([\s\S]*?)```/gi;

export function parseMarkdownSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MERMAID_FENCE)) {
    const matchStart = match.index!;
    if (matchStart > lastIndex) {
      segments.push({
        type: 'markdown',
        content: content.slice(lastIndex, matchStart),
      });
    }
    segments.push({ type: 'mermaid', code: match[1].trimEnd() });
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'markdown', content: content.slice(lastIndex) });
  }

  return segments;
}
