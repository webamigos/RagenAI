import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('server-only', () => ({}));

const brandingFindUnique = vi.fn();
const settingsFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    instanceBranding: {
      findUnique: (...a: unknown[]) => brandingFindUnique(...a),
    },
    settings: { findUnique: (...a: unknown[]) => settingsFindUnique(...a) },
  },
}));

const fetchMock = vi.fn();

const { getInstanceBrandingAction, saveInstanceBrandingAction } =
  await import('../actions');

const ADMIN = { id: 'admin-1', email: 'a@b.c', name: 'A' };
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

function form(fields: Record<string, string | Blob> = {}) {
  const body = new FormData();
  body.set('productName', 'Acme Knowledge');
  body.set('palette', 'violet');
  body.set('removeLogo', 'false');
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  return body;
}

function webAnswers(status: number, payload: unknown) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('RAGEN_APP_URL', 'http://web:3000/');
  vi.stubEnv('INTERNAL_API_SECRET', 'shh');
  requireAdmin.mockResolvedValue(ADMIN);
  webAnswers(200, {
    ok: true,
    before: { productName: null, palette: 'ragen', hasLogo: false },
    after: { productName: 'Acme Knowledge', palette: 'violet', hasLogo: false },
  });
});

describe('guarded', () => {
  it('refuses a caller who is not a platform administrator, before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(saveInstanceBrandingAction(form())).rejects.toThrow(
      'Forbidden',
    );
    await expect(getInstanceBrandingAction()).rejects.toThrow('Forbidden');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(brandingFindUnique).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe('getInstanceBrandingAction', () => {
  it('reports the defaults, and the key off, on a fresh install', async () => {
    brandingFindUnique.mockResolvedValue(null);
    settingsFindUnique.mockResolvedValue(null);

    await expect(getInstanceBrandingAction()).resolves.toEqual({
      productName: null,
      palette: 'ragen',
      hasLogo: false,
      updatedAt: null,
      enabled: false,
      enabledSource: 'code-default',
    });
  });

  it('reports what is stored, and the platform default that switched it on', async () => {
    brandingFindUnique.mockResolvedValue({
      productName: 'Acme',
      logoStorageKey: 'instance-branding/logo.png',
      primaryToken: 'petrol',
      updatedAt: new Date('2026-10-19T10:00:00Z'),
    });
    settingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: JSON.stringify({ instanceBranding: true }),
    });

    await expect(getInstanceBrandingAction()).resolves.toEqual({
      productName: 'Acme',
      palette: 'petrol',
      hasLogo: true,
      updatedAt: '2026-10-19T10:00:00.000Z',
      enabled: true,
      enabledSource: 'platform-default',
    });
  });
});

describe('saveInstanceBrandingAction', () => {
  it('posts the save to apps/web, as the administrator, and audits it', async () => {
    const outcome = await saveInstanceBrandingAction(
      form({ logo: new File([PNG], 'logo.png', { type: 'image/png' }) }),
    );

    expect(outcome).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://web:3000/api/internal/instance-branding');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-internal-secret': 'shh' });
    const sent = init.body as FormData;
    expect(sent.get('adminUserId')).toBe('admin-1');
    expect(sent.get('palette')).toBe('violet');
    expect(sent.get('productName')).toBe('Acme Knowledge');
    expect(sent.get('removeLogo')).toBe('false');
    expect(sent.get('logo')).toBeInstanceOf(Blob);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        action: 'admin.instance_branding.changed',
        entityType: 'instance_branding',
        before: { productName: null, palette: 'ragen', hasLogo: false },
        after: {
          productName: 'Acme Knowledge',
          palette: 'violet',
          hasLogo: false,
        },
        // Instance-wide: no organization, so a security event is required.
        securityEvent: expect.objectContaining({
          eventType: 'ADMIN_SETTINGS_CHANGED',
        }),
      }),
    );
  });

  it('refuses an unknown palette here, without a round trip or an audit entry', async () => {
    const outcome = await saveInstanceBrandingAction(
      form({ palette: 'crimson' }),
    );

    expect(outcome).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('refuses a name over the limit here', async () => {
    const outcome = await saveInstanceBrandingAction(
      form({ productName: 'x'.repeat(41) }),
    );

    expect(outcome).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an SVG with a script before it is sent anywhere', async () => {
    const outcome = await saveInstanceBrandingAction(
      form({
        logo: new File(['<svg><script>alert(1)</script></svg>'], 'logo.svg', {
          type: 'image/svg+xml',
        }),
      }),
    );

    expect(outcome).toMatchObject({ ok: false });
    expect(!outcome.ok && outcome.reason).toContain('<script>');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a file that only claims to be an image', async () => {
    const outcome = await saveInstanceBrandingAction(
      form({
        logo: new File(['%PDF-1.7'], 'logo.png', { type: 'image/png' }),
      }),
    );

    expect(outcome).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says what is missing when the panel cannot reach apps/web', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');

    const outcome = await saveInstanceBrandingAction(form());

    expect(outcome).toEqual({
      ok: false,
      reason: expect.stringContaining('INTERNAL_API_SECRET'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes on apps/web’s refusal, and audits the attempt', async () => {
    webAnswers(422, { error: 'The logo is over the 512 KB limit.' });

    const outcome = await saveInstanceBrandingAction(form());

    expect(outcome).toEqual({
      ok: false,
      reason: 'The logo is over the 512 KB limit.',
    });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          outcome: { ok: false, reason: 'The logo is over the 512 KB limit.' },
        }),
      }),
    );
  });

  it('reports an unreachable apps/web without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const outcome = await saveInstanceBrandingAction(form());

    expect(outcome).toEqual({
      ok: false,
      reason: 'Could not reach apps/web: ECONNREFUSED',
    });
    expect(recordAdminAction).toHaveBeenCalled();
  });
});
