import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const recordInternalAuthFailure = vi.fn();
vi.mock('@/app/api/v1/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/v1/utils')>()),
  recordInternalAuthFailure: (...a: unknown[]) =>
    recordInternalAuthFailure(...a),
}));

const updateCommand = vi.fn();
vi.mock(
  '@/features/branding/services/commands/update-instance-branding-command',
  () => ({
    updateInstanceBrandingCommand: (...a: unknown[]) => updateCommand(...a),
  }),
);

const logoQuery = vi.fn();
vi.mock(
  '@/features/branding/services/queries/get-instance-branding-logo-query',
  () => ({
    getInstanceBrandingLogoQuery: (...a: unknown[]) => logoQuery(...a),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

const { GET, POST } = await import('../route');

const URL_ = 'http://localhost/api/internal/instance-branding';
const ADMIN = { id: 'admin-1', role: 'admin', banned: false };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function form(fields: Record<string, string | Blob> = {}) {
  const body = new FormData();
  body.set('adminUserId', ADMIN.id);
  body.set('productName', 'Acme');
  body.set('palette', 'violet');
  body.set('removeLogo', 'false');
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  return body;
}

/**
 * The parsed form is handed over directly rather than serialised: under
 * jsdom, `FormData` and `File` are jsdom's, and the request body encoder is
 * Node's, and the two do not mix. What the route does with the form is the
 * subject here, not multipart parsing.
 */
const post = (body: FormData, secret = 'shh') => {
  const request = new NextRequest(URL_, {
    method: 'POST',
    headers: { 'x-internal-secret': secret },
  });
  Object.defineProperty(request, 'formData', { value: async () => body });
  return POST(request);
};

const get = (secret = 'shh', adminUserId = ADMIN.id) =>
  GET(
    new NextRequest(`${URL_}?adminUserId=${adminUserId}`, {
      headers: { 'x-internal-secret': secret },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('INTERNAL_API_SECRET', 'shh');
  findUnique.mockResolvedValue(ADMIN);
  updateCommand.mockResolvedValue({
    ok: true,
    before: { productName: null, palette: 'ragen', hasLogo: false },
    after: { productName: 'Acme', palette: 'violet', hasLogo: false },
  });
  logoQuery.mockResolvedValue({
    bytes: Buffer.from(PNG),
    contentType: 'image/png',
  });
});

describe('the two gates', () => {
  it('refuses a caller with the wrong secret, and records it', async () => {
    const response = await post(form(), 'wrong');

    expect(response.status).toBe(401);
    expect(updateCommand).not.toHaveBeenCalled();
    expect(recordInternalAuthFailure).toHaveBeenCalled();
  });

  it.each([
    ['no longer a platform administrator', { ...ADMIN, role: 'user' }],
    ['banned', { ...ADMIN, banned: true }],
    ['gone', null],
  ])(
    'refuses a named administrator who is %s, even with the secret',
    async (_label, user) => {
      findUnique.mockResolvedValue(user);

      const response = await post(form());

      expect(response.status).toBe(403);
      expect(updateCommand).not.toHaveBeenCalled();
    },
  );

  it('refuses a request that names no administrator', async () => {
    const body = form();
    body.delete('adminUserId');

    expect((await post(body)).status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('guards the preview the same way', async () => {
    expect((await get('wrong')).status).toBe(401);
    findUnique.mockResolvedValue({ ...ADMIN, role: 'user' });
    expect((await get()).status).toBe(403);
    expect(logoQuery).not.toHaveBeenCalled();
  });
});

describe('POST', () => {
  it('hands the fields and the logo bytes to the command', async () => {
    const response = await post(
      form({ logo: new File([PNG], 'logo.png', { type: 'text/plain' }) }),
    );

    expect(response.status).toBe(200);
    const [input] = updateCommand.mock.calls[0];
    expect(input).toMatchObject({
      productName: 'Acme',
      palette: 'violet',
      removeLogo: 'false',
    });
    // The bytes, not the browser's claimed type, are what the command checks.
    expect(Array.from(input.logo)).toEqual(Array.from(PNG));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      after: { palette: 'violet' },
    });
  });

  it('sends no logo when the file field is empty', async () => {
    await post(form({ logo: new File([], '') }));

    expect(updateCommand.mock.calls[0][0].logo).toBeNull();
  });

  it('answers 422 with the reason when the command refuses', async () => {
    updateCommand.mockResolvedValue({ ok: false, reason: 'Too big.' });

    const response = await post(form());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: 'Too big.' });
  });

  it('answers 500 without detail when the save throws', async () => {
    updateCommand.mockRejectedValue(new Error('db down'));

    const response = await post(form());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Server error' });
  });
});

describe('GET (the admin preview)', () => {
  it('serves the stored logo whether or not the key is on', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(logoQuery).toHaveBeenCalledWith({ ignoreFeatureKey: true });
  });

  it('answers 404 when there is no logo', async () => {
    logoQuery.mockResolvedValue(null);

    expect((await get()).status).toBe(404);
  });
});
