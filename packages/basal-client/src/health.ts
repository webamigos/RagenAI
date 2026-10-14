/**
 * Whether a basal server answers `GET /health`, for the setup page.
 *
 * Separate from `createBasalClient` on purpose: it has no breaker and no
 * cache, because it answers "is it up right now" for a screen an operator
 * is looking at, not a turn that must not wait. It never rejects.
 */
export const BASAL_HEALTH_TIMEOUT_MS = 1_500;

export async function checkBasalHealth(options: {
  readonly url: string;
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}): Promise<'up' | 'down'> {
  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(
      `${options.url.replace(/\/+$/, '')}/health`,
      {
        method: 'GET',
        headers: options.apiKey
          ? { authorization: `Bearer ${options.apiKey}` }
          : {},
        signal: AbortSignal.timeout(
          options.timeoutMs ?? BASAL_HEALTH_TIMEOUT_MS,
        ),
      },
    );
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}
