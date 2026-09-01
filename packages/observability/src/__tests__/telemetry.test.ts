import { describe, it, expect, vi, beforeEach } from 'vitest';

const startActiveSpan = vi.hoisted(() => vi.fn());
const getTracer = vi.hoisted(() => vi.fn(() => ({ startActiveSpan })));
const getMeter = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    trace: { ...actual.trace, getTracer },
    metrics: { ...actual.metrics, getMeter },
  };
});

const { createTelemetry } = await import('../telemetry');
const { SpanStatusCode } = await import('@opentelemetry/api');

const { withSpan } = createTelemetry('ragen-test');

type FakeSpan = {
  setStatus: ReturnType<typeof vi.fn>;
  recordException: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function makeSpan(): FakeSpan {
  return { setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() };
}

let span: FakeSpan;

beforeEach(() => {
  vi.clearAllMocks();
  span = makeSpan();
  // Mirror the real startActiveSpan contract: invoke the callback with a span.
  startActiveSpan.mockImplementation(
    (_name: string, _opts: unknown, fn: (s: FakeSpan) => unknown) => fn(span),
  );
});

describe('createTelemetry', () => {
  it('names the tracer and meter after the service', () => {
    createTelemetry('ragen-api');
    expect(getTracer).toHaveBeenCalledWith('ragen-api');
    expect(getMeter).toHaveBeenCalledWith('ragen-api');
  });

  it('lets OTEL_SERVICE_NAME override the service name', () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'override');
    createTelemetry('ragen-api');
    expect(getTracer).toHaveBeenCalledWith('override');
    vi.unstubAllEnvs();
  });
});

describe('withSpan', () => {
  it('returns the callback result and marks the span OK', async () => {
    const result = await withSpan('op', { a: 1 }, async () => 'value');

    expect(result).toBe('value');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.recordException).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('passes the span to the callback so attributes can be set mid-flight', async () => {
    const received = await withSpan('op', {}, async (s) => s);

    expect(received).toBe(span);
  });

  it('forwards the name and attributes to the tracer', async () => {
    await withSpan('rag.retrieve', { 'rag.query_count': 3 }, async () => null);

    expect(startActiveSpan).toHaveBeenCalledWith(
      'rag.retrieve',
      { attributes: { 'rag.query_count': 3 } },
      expect.any(Function),
    );
  });

  it('records the exception, marks ERROR and rethrows', async () => {
    const err = new Error('boom');

    await expect(
      withSpan('op', {}, async () => {
        throw err;
      }),
    ).rejects.toThrow('boom');

    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });
    expect(span.recordException).toHaveBeenCalledWith(err);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('wraps non-Error throws so recordException always gets an Error', async () => {
    await expect(
      withSpan('op', {}, async () => {
        throw 'plain string';
      }),
    ).rejects.toBe('plain string');

    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'Unknown error',
    });
    expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
