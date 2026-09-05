import { SpanStatusCode } from '@ragenai/observability';

import { tracer } from '../telemetry.js';
import { withToolSpan } from '../with-tool-span.js';

jest.mock('../telemetry.js', () => ({
  tracer: { startActiveSpan: jest.fn() },
}));

type FakeSpan = {
  setAttributes: jest.Mock;
  setStatus: jest.Mock;
  recordException: jest.Mock;
  end: jest.Mock;
};

const mockStartActiveSpan = tracer.startActiveSpan as unknown as jest.Mock;

function armTracer(): {
  span: FakeSpan;
  captured: {
    name?: string;
    options?: { attributes?: Record<string, unknown> };
  };
} {
  const span: FakeSpan = {
    setAttributes: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };
  const captured: {
    name?: string;
    options?: { attributes?: Record<string, unknown> };
  } = {};

  mockStartActiveSpan.mockImplementation(
    (
      name: string,
      options: { attributes?: Record<string, unknown> },
      fn: (span: FakeSpan) => unknown,
    ) => {
      captured.name = name;
      captured.options = options;
      return fn(span);
    },
  );

  return { span, captured };
}

describe('withToolSpan', () => {
  beforeEach(() => {
    mockStartActiveSpan.mockReset();
  });

  it('names the span after the tool and carries the caller attributes', async () => {
    const { captured } = armTracer();

    await withToolSpan('ragen_chat', { 'ragen.assistant_id': 'asst-1' }, () =>
      Promise.resolve({ payload: '{}' }),
    );

    expect(captured.name).toBe('mcp.tool ragen_chat');
    expect(captured.options?.attributes).toEqual({
      'mcp.tool.name': 'ragen_chat',
      'ragen.assistant_id': 'asst-1',
    });
  });

  it('returns the payload and marks the span OK on success', async () => {
    const { span } = armTracer();

    const result = await withToolSpan('ragen_chat', {}, () =>
      Promise.resolve({ payload: '{"success":true}' }),
    );

    expect(result).toBe('{"success":true}');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('marks the span ERROR when the tool reports a failure, without throwing', async () => {
    // The whole reason this helper exists rather than ADR-28's withSpan: an
    // upstream failure is *returned*, not thrown, so inferring the status
    // from "did it throw" would paint a failed tool call green.
    const { span } = armTracer();

    const result = await withToolSpan('ragen_chat', {}, () =>
      Promise.resolve({
        payload: '{"success":false}',
        failure: {
          message: 'Assistant not found',
          attributes: { 'ragen.api.status': 404 },
        },
      }),
    );

    expect(result).toBe('{"success":false}');
    expect(span.setAttributes).toHaveBeenCalledWith({
      'ragen.api.status': 404,
    });
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'Assistant not found',
    });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('records and rethrows an unexpected exception, still ending the span', async () => {
    const { span } = armTracer();
    const boom = new Error('boom');

    await expect(
      withToolSpan('ragen_chat', {}, () => Promise.reject(boom)),
    ).rejects.toThrow('boom');

    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });
    expect(span.recordException).toHaveBeenCalledWith(boom);
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
