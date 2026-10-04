import {
  CONNECTION_HELP,
  NO_CONNECTION,
  createApiClient,
  requestRaw,
  resolveConnection,
} from './api';
import { parseFlags } from './flags';
import { sseData } from './sse';

/**
 * `ragen ask <question>` — one chat turn over `POST /v1/chat`, the same
 * retrieval and guardrails as the panel, streamed as it is written.
 *
 * `ragen brain query` asks the same endpoint and stays as it is: it belongs
 * to the Brain command set and answers in one piece. This is the general
 * one, for any key.
 */

export interface AskDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  /** Raw stdout, no newline added — the answer arrives in pieces. */
  write: (chunk: string) => void;
  out: (message: string) => void;
  err: (message: string) => void;
}

const REASONING = new Set(['low', 'medium', 'high']);

const USAGE = [
  'Usage',
  '  ragen ask <question> [options]',
  '',
  'Asks the knowledge base as chat does, and prints the answer as it is written.',
  '',
  'Options',
  '  --assistant <id>      ask this assistant (or RAGEN_ASSISTANT_ID); see `ragen assistants ls`',
  '  --reasoning <level>   low, medium or high, for models that reason; ignored by others',
  '  --no-stream           print the answer once it is complete',
  CONNECTION_HELP,
  '  --json                print {"text": …} once complete',
].join('\n');

/** What `/v1/chat` sends for an answer a guardrail stopped mid-stream. */
interface ChatEvent {
  text?: string;
  replace?: boolean;
  reasoning?: string;
}

export async function runAsk(args: string[], deps: AskDeps): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    deps.out(USAGE);
    return args.length === 0 ? 1 : 0;
  }
  try {
    const flags = parseFlags(args, ['--assistant', '--reasoning']);
    const question = flags.positional.join(' ').trim();
    if (!question) {
      deps.err('Ask something: ragen ask "What is our refund policy?"');
      return 1;
    }
    const reasoning = flags.values.get('--reasoning');
    if (reasoning !== undefined && !REASONING.has(reasoning)) {
      deps.err(`--reasoning takes low, medium or high, not "${reasoning}".`);
      return 1;
    }
    const connection = resolveConnection(flags, deps.env);
    if (!connection) {
      deps.err(NO_CONNECTION);
      return 1;
    }
    const assistant =
      flags.values.get('--assistant') ?? deps.env.RAGEN_ASSISTANT_ID;
    const json = flags.switches.has('--json');
    const stream = !json && !flags.switches.has('--no-stream');
    const body = {
      content: question,
      stream,
      ...(assistant ? { assistant_id: assistant } : {}),
      ...(reasoning ? { reasoning_effort: reasoning } : {}),
    };
    const notFound =
      'No such assistant for this key. See `ragen assistants ls`, or pass --assistant <id>.';

    if (!stream) {
      const api = createApiClient(deps.fetch, connection);
      const answer = await api<{ text?: string }>('chat', {
        method: 'POST',
        body,
        notFound,
      });
      deps.out(json ? JSON.stringify(answer, null, 2) : (answer.text ?? ''));
      return 0;
    }

    const res = await requestRaw(deps.fetch, connection, 'chat', {
      method: 'POST',
      body,
      notFound,
      accept: 'text/event-stream',
    });
    if (!res.body) {
      throw new Error('The API answered with no body.');
    }
    return await printStream(deps, res.body);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/**
 * Prints text deltas as they come. A stream that ends without `[DONE]` was
 * cut off — the API logs a failure mid-answer and closes the connection
 * without saying so in the body — and is reported as one, not passed off as a
 * short answer.
 */
async function printStream(
  deps: AskDeps,
  body: ReadableStream<Uint8Array>,
): Promise<number> {
  let printed = false;
  for await (const data of sseData(body)) {
    if (data === '[DONE]') {
      if (printed) {
        deps.write('\n');
      }
      return 0;
    }
    let event: ChatEvent;
    try {
      event = JSON.parse(data) as ChatEvent;
    } catch {
      continue;
    }
    if (event.replace) {
      // A guardrail stopped the answer: what was already printed is
      // withdrawn and the refusal is the answer. A terminal cannot unprint
      // it, so say plainly that it is withdrawn.
      if (printed) {
        deps.write('\n');
        deps.err('[the answer above was withdrawn by a guardrail]');
      }
      deps.write(event.text ?? '');
      printed = true;
    } else if (event.text) {
      deps.write(event.text);
      printed = true;
    }
  }
  if (printed) {
    deps.write('\n');
  }
  deps.err('The answer was cut off before the API finished it.');
  return 1;
}
