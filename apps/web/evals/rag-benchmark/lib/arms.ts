/**
 * The two arms the benchmark compares.
 *
 * `rag` drives the product exactly as a user does — the same chat endpoint,
 * the same thread, so rephrase, multi-query expansion, hybrid search,
 * reranking and the answer prompt all run. `no-rag` asks the same model the
 * same question with no documents at all.
 *
 * The control is the whole point of publishing a number. Our figures are
 * invented, so the control shows what the model produces without retrieval,
 * and the gap between the columns is what the product adds. A RAG score on
 * its own is unfalsifiable.
 */

import { generateText } from 'ai';

import { nativeChatInstance } from '@/libs/llm/native-models';

/**
 * Node's `fetch` has no default timeout, so a stalled socket blocks the run
 * forever rather than failing into the retry. A pipeline turn is seconds and a
 * control call less, so anything past this is hung, not slow.
 */
const RAG_TIMEOUT_MS = 180_000;
const CONTROL_TIMEOUT_MS = 120_000;

export interface RagAnswer {
  text: string;
  citedFileIds: string[];
}

/** Concatenate the SSE `content` deltas and pick up the `citations` frame. */
export async function askRag(opts: {
  appUrl: string;
  threadId: string;
  cookie: string;
  question: string;
}): Promise<RagAnswer> {
  const res = await fetch(
    `${opts.appUrl}/api/threads/${opts.threadId}?mode=rag`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: opts.cookie,
        // Better Auth rejects a missing/null Origin, and Node's fetch sends
        // `null` unless told otherwise.
        Origin: opts.appUrl,
      },
      body: JSON.stringify({ prompt: opts.question, mode: 'rag' }),
      signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new Error(`Chat request failed (${res.status}): ${await res.text()}`);
  }
  return parseRagStream(await res.text());
}

export function parseRagStream(raw: string): RagAnswer {
  const parts: string[] = [];
  const citedFileIds: string[] = [];

  // Frames are separated by a blank line; `event:` is optional (content
  // deltas carry only `data:`).
  for (const frame of raw.split(/\n\n+/)) {
    const eventMatch = frame.match(/^event: (.+)$/m);
    const dataMatch = frame.match(/^data: (\{[\s\S]*\})$/m);
    if (!dataMatch) {
      continue;
    }
    let payload: { content?: string; fileIds?: string[] };
    try {
      payload = JSON.parse(dataMatch[1]) as typeof payload;
    } catch {
      // Heartbeats and control frames that are not JSON are expected.
      continue;
    }
    if (eventMatch?.[1] === 'citations' && Array.isArray(payload.fileIds)) {
      citedFileIds.push(...payload.fileIds);
    } else if (typeof payload.content === 'string') {
      parts.push(payload.content);
    }
  }

  return { text: parts.join(''), citedFileIds };
}

/**
 * The control arm: same model, same question, no documents.
 *
 * Resolved through the gateway the product uses, rather than by posting
 * `/v1/chat/completions` at a base URL. It did the latter until this change,
 * against `LITELLM_PROXY_URL ?? 'http://localhost:4000'` — and B6 removed the
 * proxy, so the control arm and the judge had been pointing at nothing since.
 * A benchmark whose control cannot answer produces no number at all, which is
 * the one failure mode that does not look like a quality regression.
 *
 * Going through `nativeChatInstance` also means the control reaches the same
 * upstream the RAG arm does, which is what makes the two columns comparable:
 * the gap is supposed to be retrieval, not two different routes to two
 * different deployments of the same model name.
 */
export async function askControl(opts: {
  model: string;
  question: string;
}): Promise<string> {
  const { text } = await generateText({
    model: nativeChatInstance({ model: opts.model, temperature: 0 }),
    // Deliberately plain. Giving the control a "say you don't know"
    // instruction would hand it the guard cases for free and make the
    // comparison flattering in the wrong direction; giving it none at all is
    // what a user typing into a bare chat box gets.
    prompt: opts.question,
    abortSignal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  return text;
}
