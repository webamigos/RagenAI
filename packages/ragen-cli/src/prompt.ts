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
    const onData = (chunk: string) => {
      state = applyKeystrokes(state, chunk);
      if (!state.done) {
        return;
      }
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write('\n');
      if (state.cancelled) {
        reject(new Error('Cancelled.'));
      } else {
        resolve(state.value);
      }
    };
    stdin.on('data', onData);
  });
}

/** The first line of piped stdin: `echo "$KEY" | ragen login --url …`. */
export async function readFirstLine(
  stream: AsyncIterable<Buffer | string>,
): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (text.includes('\n')) {
      break;
    }
  }
  return text.split(/\r?\n/)[0] ?? '';
}
