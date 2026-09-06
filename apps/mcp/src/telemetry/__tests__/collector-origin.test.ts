import { collectorOriginOf } from '../collector-origin.js';

describe('collectorOriginOf', () => {
  it('reduces a plain endpoint to scheme, host and port', () => {
    expect(collectorOriginOf('http://localhost:4318')).toBe(
      'http://localhost:4318',
    );
    expect(collectorOriginOf('https://collector.example.com/otlp')).toBe(
      'https://collector.example.com',
    );
  });

  it('strips userinfo, which is where an OTLP credential usually hides', () => {
    // The shape Grafana Cloud publishes. Printing this raw at startup would
    // put the token in Railway's log view.
    const endpoint = 'https://123456:glc_eyJvIjoiN@otlp-gateway.example/otlp';

    const origin = collectorOriginOf(endpoint);

    expect(origin).toBe('https://otlp-gateway.example');
    expect(origin).not.toContain('glc_eyJvIjoiN');
    expect(origin).not.toContain('123456');
    expect(origin).not.toContain('@');
  });

  it('strips a token carried in the query string', () => {
    const origin = collectorOriginOf(
      'https://collector.example.com/v1?api-key=super-secret',
    );

    expect(origin).toBe('https://collector.example.com');
    expect(origin).not.toContain('super-secret');
  });

  it('keeps a non-default port, which is what makes the log useful', () => {
    expect(
      collectorOriginOf('http://otel-collector.railway.internal:4318'),
    ).toBe('http://otel-collector.railway.internal:4318');
  });

  it('returns undefined rather than the raw value for an unparseable endpoint', () => {
    // The caller must not fall back to printing the input here: it may
    // still hold a token, and it cannot be redacted reliably.
    expect(collectorOriginOf('not a url')).toBeUndefined();
    expect(collectorOriginOf('')).toBeUndefined();
  });

  it('rejects a scheme-less host:port, which URL parses as a scheme rather than rejecting', () => {
    // `new URL('localhost:4318')` does not throw: it reads `localhost:` as
    // the scheme, and `.origin` is then the string "null". Returned as-is
    // that would log "sending to null" and leave the undici self-trace
    // guard matching nothing.
    expect(collectorOriginOf('localhost:4318')).toBeUndefined();
    expect(collectorOriginOf('otel-collector.railway.internal:4318')).toBe(
      undefined,
    );
  });

  it('rejects a non-HTTP scheme, which OTLP/HTTP cannot use', () => {
    expect(
      collectorOriginOf('grpc://collector.example.com:4317'),
    ).toBeUndefined();
    expect(collectorOriginOf('file:///etc/passwd')).toBeUndefined();
  });
});
