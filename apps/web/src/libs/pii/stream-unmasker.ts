import { redactPiiPlaceholders } from './redact-placeholders';

const TOKEN_START = '<';
const TOKEN_END = '>';

/** The characters a Presidio placeholder is made of, between the brackets. */
const TOKEN_BODY_CHAR = /[A-Z0-9_]/;

/**
 * Longest body worth holding back for. Presidio's entity names are short; a
 * run of capitals longer than this is prose (or a shouted sentence), and
 * buffering it would stall the stream for nothing.
 */
const MAX_TOKEN_BODY_LENGTH = 64;

/**
 * Puts chat-time PII back into the model's streamed answer, and makes sure a
 * placeholder it cannot restore never reaches the reader.
 *
 * Two kinds of token come out of a model:
 *
 * - one in the alias map — the model copied a placeholder from the masked
 *   question, and the real value is restored;
 * - one that is placeholder-shaped but *not* in the map — the model invented
 *   it, or echoed an ingest-time `<PERSON>`. There is nothing to restore it
 *   to, so it is rewritten by `redactPiiPlaceholders` into a readable
 *   "[redacted phone number]" instead of reaching the user, and the thread's
 *   history, as `<PL_PHONE_1>`.
 *
 * That second case is why there is no shortcut for an empty map: a turn with
 * nothing masked is exactly the turn where every placeholder is invented.
 *
 * A token can be split across chunks. Only a tail that could still become a
 * placeholder (`<`, then capitals, digits and underscores) is held back, so a
 * `<` in ordinary prose or code does not stall the stream until it ends.
 */
export class StreamUnmasker {
  private aliasMap: Record<string, string>;
  private buffer: string;

  constructor(aliasMap: Record<string, string>) {
    this.aliasMap = aliasMap;
    this.buffer = '';
  }

  process(chunk: string): string {
    const input = this.buffer + chunk;
    this.buffer = '';

    let output = '';
    let i = 0;

    while (i < input.length) {
      const tokenStart = input.indexOf(TOKEN_START, i);

      if (tokenStart === -1) {
        output += input.slice(i);
        break;
      }

      output += input.slice(i, tokenStart);

      let bodyEnd = tokenStart + 1;
      while (
        bodyEnd < input.length &&
        bodyEnd - tokenStart - 1 <= MAX_TOKEN_BODY_LENGTH &&
        TOKEN_BODY_CHAR.test(input[bodyEnd])
      ) {
        bodyEnd++;
      }

      const bodyLength = bodyEnd - tokenStart - 1;

      if (bodyEnd === input.length && bodyLength <= MAX_TOKEN_BODY_LENGTH) {
        // Could still become a placeholder once the next chunk arrives.
        this.buffer = input.slice(tokenStart);
        break;
      }

      if (input[bodyEnd] === TOKEN_END && bodyLength > 0) {
        const candidate = input.slice(tokenStart, bodyEnd + 1);
        output += this.resolve(candidate);
        i = bodyEnd + 1;
        continue;
      }

      // Not a placeholder: emit the `<` as prose and keep scanning after it.
      output += TOKEN_START;
      i = tokenStart + 1;
    }

    return output;
  }

  /**
   * The end of the answer. A buffered tail never closed, so it is not a
   * placeholder — but it goes through the same rewrite anyway, so nothing
   * leaves this class without having been looked at.
   */
  flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    return redactPiiPlaceholders(remaining);
  }

  private resolve(candidate: string): string {
    if (Object.hasOwn(this.aliasMap, candidate)) {
      return this.aliasMap[candidate];
    }
    return redactPiiPlaceholders(candidate);
  }
}
