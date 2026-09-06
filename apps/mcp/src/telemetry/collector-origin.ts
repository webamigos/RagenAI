/**
 * Reduce an OTLP endpoint to the only form of it that is safe to log.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` can carry a credential. Userinfo is a
 * documented OTLP pattern — Grafana Cloud, among others, publishes
 * `https://<instanceId>:<token>@otlp-gateway.example/otlp` — and a token in
 * the query string is equally possible. Printing the raw value at startup
 * puts that credential in the process logs, and on Railway that means the
 * log view and anything shipping from it.
 *
 * `URL.origin` is scheme + host + port: userinfo, path and query are all
 * dropped. That still answers the question a startup log is for ("which
 * collector is this pointed at?") without answering "and with what key?".
 *
 * Returns `undefined` for an unparseable endpoint. Callers must not fall
 * back to printing the raw string in that case — a value that failed to
 * parse cannot be redacted reliably, and may still contain the token.
 *
 * Doubles as the value the undici ignore hook compares against, so the
 * exporter's own calls to the collector are not themselves traced.
 *
 * `src/env.ts` validates the same variable with `httpUrl()` and refuses to
 * boot on a scheme-less one, which looks like it makes the `undefined` branch
 * here unreachable. It does not: `instrument.js` is index.ts's first import
 * and reads `process.env` directly, precisely so instrumentation is installed
 * before anything else — it runs before `getEnv()` ever gets the chance to
 * reject the value. Both checks are load-bearing.
 */
export function collectorOriginOf(endpoint: string): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }

  // `new URL('localhost:4318')` does *not* throw — it reads `localhost:` as
  // the scheme and `4318` as the path, and its `.origin` is the string
  // "null". Returning that would put "sending to null" in the startup log
  // and, worse, silently make the undici ignore hook match nothing, so the
  // exporter's own requests would be traced after all. An OTLP/HTTP
  // endpoint has to be http or https, so anything else is a
  // misconfiguration to report, not an origin to use.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }

  return url.origin;
}
