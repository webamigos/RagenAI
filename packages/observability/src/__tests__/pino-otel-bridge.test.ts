import { describe, it, expect } from 'vitest';

import { mapPinoLogToOtel, PINO_LEVEL_TO_OTEL } from '../pino-otel-bridge';

// pino's numeric levels, spelled out so the intent of each case is readable.
const TRACE = 10;
const DEBUG = 20;
const INFO = 30;
const WARN = 40;
const ERROR = 50;
const FATAL = 60;

describe('mapPinoLogToOtel', () => {
  describe('level mapping', () => {
    it.each([
      [INFO, 'info'],
      [WARN, 'warn'],
      [ERROR, 'error'],
    ])('maps pino level %i to OTel %s', (level, severity) => {
      expect(mapPinoLogToOtel(level, ['a message'])).toEqual({
        severity,
        message: 'a message',
        attributes: undefined,
      });
    });

    it('folds fatal onto error, which is the highest severity OTel offers', () => {
      expect(mapPinoLogToOtel(FATAL, ['Unrecoverable'])?.severity).toBe(
        'error',
      );
    });

    it.each([
      ['trace', TRACE],
      ['debug', DEBUG],
    ])('does not ship %s to the collector', (_name, level) => {
      // Deliberate, not an omission: these are a local aid, and mirroring
      // them is volume nobody reads. They still reach stdout via pino.
      expect(mapPinoLogToOtel(level, ['Verbose detail'])).toBeUndefined();
    });

    it('emits nothing for a custom level that is not in the map', () => {
      expect(mapPinoLogToOtel(35, ['a message'])).toBeUndefined();
    });
  });

  describe('argument shapes', () => {
    it('reads a bare string call as the message, with no attributes', () => {
      expect(mapPinoLogToOtel(INFO, ['Server started'])).toEqual({
        severity: 'info',
        message: 'Server started',
        attributes: undefined,
      });
    });

    it('splits a (attributes, message) call into both halves', () => {
      expect(
        mapPinoLogToOtel(ERROR, [
          { tool: 'ragen_chat', status: 500 },
          'Tool call failed',
        ]),
      ).toEqual({
        severity: 'error',
        message: 'Tool call failed',
        attributes: { tool: 'ragen_chat', status: 500 },
      });
    });

    it('emits nothing for an attributes-only call, which has no message to be the body', () => {
      expect(mapPinoLogToOtel(WARN, [{ tool: 'ragen_chat' }])).toBeUndefined();
    });

    it('emits nothing for a call with no arguments at all', () => {
      expect(mapPinoLogToOtel(INFO, [])).toBeUndefined();
    });

    it('emits nothing when the first argument is neither a string nor an object', () => {
      expect(mapPinoLogToOtel(INFO, [42])).toBeUndefined();
    });

    it('treats null as no attributes rather than reading through it', () => {
      // `typeof null === 'object'` — the guard all three copies carried, and
      // the reason it was there.
      expect(mapPinoLogToOtel(INFO, [null, 'still a message'])).toBeUndefined();
    });

    it('drops an empty-string message, which would make an empty log body', () => {
      expect(mapPinoLogToOtel(INFO, [''])).toBeUndefined();
      expect(mapPinoLogToOtel(INFO, [{ a: 1 }, ''])).toBeUndefined();
    });

    it('ignores a trailing interpolation argument, which pino formats itself', () => {
      // pino would render `logger.info('hello %s', 'world')` as
      // "hello world"; the OTel copy keeps the raw format string rather than
      // reimplementing printf. Documented here because it is a real
      // difference between the two sinks, not an accident.
      expect(mapPinoLogToOtel(INFO, ['hello %s', 'world'])).toEqual({
        severity: 'info',
        message: 'hello %s',
        attributes: undefined,
      });
    });

    it('passes an Error in the attributes through untouched, for normalizeAttributes to expand', () => {
      const err = new Error('boom');

      expect(mapPinoLogToOtel(ERROR, [{ err }, 'Request failed'])).toEqual({
        severity: 'error',
        message: 'Request failed',
        attributes: { err },
      });
    });
  });

  it('exposes the level map so a consumer can assert on it without duplicating it', () => {
    expect(PINO_LEVEL_TO_OTEL).toEqual({
      30: 'info',
      40: 'warn',
      50: 'error',
      60: 'error',
    });
  });
});
