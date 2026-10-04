/**
 * Reading a secret without echoing it, with no dependency: this package is
 * published standalone and stays dependency-free.
 *
 * The keystroke handling is a pure function so it can be tested; the stream
 * plumbing around it is the only part that touches the terminal.
 */

export interface KeystrokeState {
  value: string;
  done: boolean;
  cancelled: boolean;
}

const ENTER = new Set(['\r', '\n']);
const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const BACKSPACE = new Set(['\u007f', '\b']);

/**
 * Applies one chunk of raw-mode input. A paste arrives as one chunk of many
 * characters, so this walks the chunk rather than assuming one key per event.
 */
export function applyKeystrokes(
  state: KeystrokeState,
  chunk: string,
): KeystrokeState {
  let { value } = state;
  for (const ch of chunk) {
    if (ENTER.has(ch) || ch === CTRL_D) {
      return { value, done: true, cancelled: false };
    }
    if (ch === CTRL_C) {
      return { value: '', done: true, cancelled: true };
    }
    if (BACKSPACE.has(ch)) {
      value = value.slice(0, -1);
    } else if (ch >= ' ') {
      value += ch;
    }
  }
  return { value, done: false, cancelled: false };
}

/** Prompts on stderr, so `ragen login > log` still shows the question. */
export function promptHidden(question: string): Promise<string> {
  const { stdin, stderr } = process;
  stderr.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let state: KeystrokeState = { value: '', done: false, cancelled: false };
    // Every way out restores the terminal: a key, Ctrl-C, the input closing
    // or failing. A promise left pending would let the process exit 0 having
    // saved nothing, with the terminal still in raw mode.
    const finish = (outcome: () => void) => {
      stdin.off('data', onData);
      stdin.off('end', onEnd);
      stdin.off('error', onError);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write('\n');
      outcome();
    };
    const onData = (chunk: string) => {
      state = applyKeystrokes(state, chunk);
      if (!state.done) {
        return;
      }
      finish(() =>
        state.cancelled
          ? reject(new Error('Cancelled.'))
          : resolve(state.value),
      );
    };
    const onEnd = () =>
      finish(() =>
        reject(new Error('The input closed before a key was entered.')),
      );
    const onError = (error: Error) => finish(() => reject(error));
    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onError);
  });
}

/**
 * The first line of piped stdin: `echo "$KEY" | ragen login --url …`.
 * Gives up after `timeoutMs` without a line, rather than hanging on a stdin
 * that is open and silent.
 */
export async function readFirstLine(
  stream: AsyncIterable<Buffer | string>,
  timeoutMs: number,
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // An open stdin keeps the process alive after the error is printed.
      (stream as { destroy?: () => void }).destroy?.();
      reject(
        new Error(
          'No API key arrived on stdin. Pipe one in, run in a terminal to be asked, or pass --api-key.',
        ),
      );
    }, timeoutMs);
  });
  const read = (async () => {
    let text = '';
    for await (const chunk of stream) {
      text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (text.includes('\n')) {
        break;
      }
    }
    return text.split(/\r?\n/)[0] ?? '';
  })();
  // Destroying the stream on timeout rejects `read` after the race is
  // settled; without a handler that is an unhandled rejection.
  read.catch(() => undefined);
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
