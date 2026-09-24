import type { BrainAssistantEvent } from '../contracts/brain-assistant.types';

/**
 * The route's newline-delimited JSON, as events. A line split across two
 * chunks is joined before it is parsed; a line that is not JSON is skipped
 * rather than ending the turn.
 */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<BrainAssistantEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        const event = parseLine(line);
        if (event) {
          yield event;
        }
      }
      if (done) {
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): BrainAssistantEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown };
    return typeof parsed.type === 'string'
      ? (parsed as BrainAssistantEvent)
      : null;
  } catch {
    return null;
  }
}
