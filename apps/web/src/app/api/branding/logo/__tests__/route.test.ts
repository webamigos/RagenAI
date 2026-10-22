import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoQuery = vi.fn();
vi.mock(
  '@/features/branding/services/queries/get-instance-branding-logo-query',
  () => ({
    getInstanceBrandingLogoQuery: (...a: unknown[]) => logoQuery(...a),
  }),
);

const error = vi.fn();
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: (...a: unknown[]) => error(...a) },
}));

const { GET } = await import('../route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/branding/logo', () => {
  it('serves the logo with the type its key names, cached for good', async () => {
    logoQuery.mockResolvedValue({
      bytes: Buffer.from('png-bytes'),
      contentType: 'image/png',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      'png-bytes',
    );
    // The public path honours the feature key: no options passed.
    expect(logoQuery).toHaveBeenCalledWith();
  });

  /**
   * Opened directly, an SVG is a document in this origin. The sandbox policy
   * is what keeps a script that slipped past the upload check from running
   * with the panel's cookies.
   */
  it('serves every logo, SVG included, in a sandbox that runs no script', async () => {
    logoQuery.mockResolvedValue({
      bytes: Buffer.from('<svg/>'),
      contentType: 'image/svg+xml',
    });

    const response = await GET();
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain('sandbox');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('allow-scripts');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers 404 when there is no logo to serve, or the key is off', async () => {
    logoQuery.mockResolvedValue(null);

    expect((await GET()).status).toBe(404);
  });

  it('answers 500 and logs when storage fails', async () => {
    logoQuery.mockRejectedValue(new Error('s3 down'));

    expect((await GET()).status).toBe(500);
    expect(error).toHaveBeenCalled();
  });
});
