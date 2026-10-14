import { describe, expect, it, vi } from 'vitest';

import { checkBasalHealth } from '../health';

describe('checkBasalHealth', () => {
  it('is up on a 2xx from /health, with the key as a bearer token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(
      checkBasalHealth({ url: 'http://basal:8000/', apiKey: 'k', fetch }),
    ).resolves.toBe('up');
    expect(fetch).toHaveBeenCalledWith(
      'http://basal:8000/health',
      expect.objectContaining({ headers: { authorization: 'Bearer k' } }),
    );
  });

  it('is down on an error status, a network failure or a timeout', async () => {
    const statuses = [
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    ];
    for (const fetch of statuses) {
      await expect(
        checkBasalHealth({ url: 'http://basal:8000', fetch }),
      ).resolves.toBe('down');
    }
  });
});
