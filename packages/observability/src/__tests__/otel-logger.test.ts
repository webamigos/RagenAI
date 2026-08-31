import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const emit = vi.hoisted(() => vi.fn());
const getLogger = vi.hoisted(() => vi.fn(() => ({ emit })));

vi.mock('@opentelemetry/api-logs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@opentelemetry/api-logs')>();
  return { ...actual, logs: { ...actual.logs, getLogger } };
});

import { createOtelLogger, normalizeAttributes } from '../otel-logger';
import { SeverityNumber } from '@opentelemetry/api-logs';

describe('createOtelLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the supplied scope name', () => {
    createOtelLogger('ragen-worker');
    expect(getLogger).toHaveBeenCalledWith('ragen-worker');
  });

  // The three copies this replaced disagreed here: only ragen-app's honoured
  // the env var, the other two hardcoded their name (ADR-28).
  it('lets OTEL_SERVICE_NAME override the scope name', () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'custom-name');
    createOtelLogger('ragen-worker');
    expect(getLogger).toHaveBeenCalledWith('custom-name');
  });

  it('ignores a blank OTEL_SERVICE_NAME', () => {
    vi.stubEnv('OTEL_SERVICE_NAME', '   ');
    createOtelLogger('ragen-api');
    expect(getLogger).toHaveBeenCalledWith('ragen-api');
  });

  it.each([
    ['debug', SeverityNumber.DEBUG, 'DEBUG'],
    ['info', SeverityNumber.INFO, 'INFO'],
    ['warn', SeverityNumber.WARN, 'WARN'],
    ['error', SeverityNumber.ERROR, 'ERROR'],
  ])(
    'emits %s at the right severity',
    (level, severityNumber, severityText) => {
      const logger = createOtelLogger('svc');
      (logger as unknown as Record<string, (m: string) => void>)[level](
        'hello',
      );

      expect(emit).toHaveBeenCalledWith({
        severityNumber,
        severityText,
        body: 'hello',
        attributes: {},
      });
    },
  );
});

describe('normalizeAttributes', () => {
  it('returns an empty object for no attributes', () => {
    expect(normalizeAttributes()).toEqual({});
  });

  it('passes scalars through', () => {
    expect(normalizeAttributes({ a: 's', b: 1, c: true })).toEqual({
      a: 's',
      b: 1,
      c: true,
    });
  });

  // The reason this helper exists rather than a bare JSON.stringify: an Error
  // would otherwise serialize to "{}" and lose the stack.
  it('expands an Error into type, message and stacktrace', () => {
    const err = new TypeError('boom');
    const out = normalizeAttributes({ err });

    expect(out['err.type']).toBe('TypeError');
    expect(out['err.message']).toBe('boom');
    expect(typeof out['err.stacktrace']).toBe('string');
  });

  it('serializes dates as ISO strings', () => {
    const d = new Date('2026-09-01T00:00:00.000Z');
    expect(normalizeAttributes({ d })).toEqual({
      d: '2026-09-01T00:00:00.000Z',
    });
  });

  it('JSON-stringifies plain objects', () => {
    expect(normalizeAttributes({ o: { a: 1 } })).toEqual({ o: '{"a":1}' });
  });

  // A logging helper must never throw: `new Date('nonsense').toISOString()`
  // raises RangeError, and all three copies this replaced would have crashed.
  it('does not throw on an invalid Date', () => {
    const out = normalizeAttributes({ d: new Date('nonsense') });
    expect(out.d).toBe('Invalid Date');
  });

  // JSON.stringify returns undefined (not a string) for these, which would put
  // a non-scalar into a map typed string | number | boolean.
  it.each([
    ['undefined', undefined, 'undefined'],
    ['a function', () => 1, '() => 1'],
    ['a symbol', Symbol('s'), 'Symbol(s)'],
  ])('coerces %s to a string', (_label, value, expected) => {
    const out = normalizeAttributes({ v: value });
    expect(typeof out.v).toBe('string');
    expect(out.v).toBe(expected);
  });

  it('falls back to String() for values JSON cannot handle', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const out = normalizeAttributes({ circular });
    expect(typeof out.circular).toBe('string');
  });
});
