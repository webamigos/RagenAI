import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const clearCache = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { instanceBranding: { findUnique, upsert } },
}));
vi.mock('@/libs/storage', () => ({
  getStorageProvider: () => ({ upload, delete: remove }),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../queries/get-instance-branding-query', () => ({
  clearInstanceBrandingCache: clearCache,
}));

import { updateInstanceBrandingCommand } from '../update-instance-branding-command';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
);

const input = (
  fields: Partial<Parameters<typeof updateInstanceBrandingCommand>[0]> = {},
) => ({
  productName: 'Acme Knowledge',
  palette: 'violet',
  removeLogo: 'false',
  logo: null,
  ...fields,
});

describe('updateInstanceBrandingCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(null);
    upsert.mockImplementation(async ({ create }) => ({
      productName: create.productName,
      primaryToken: create.primaryToken,
      logoStorageKey: create.logoStorageKey,
    }));
    upload.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
  });

  it('writes the single row and clears the cache, so the next render shows it', async () => {
    const result = await updateInstanceBrandingCommand(input());

    expect(result).toEqual({
      ok: true,
      before: { productName: null, palette: 'ragen', hasLogo: false },
      after: {
        productName: 'Acme Knowledge',
        palette: 'violet',
        hasLogo: false,
      },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        create: {
          id: 1,
          productName: 'Acme Knowledge',
          primaryToken: 'violet',
          logoStorageKey: null,
        },
      }),
    );
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('stores an empty name as null, meaning the default', async () => {
    await updateInstanceBrandingCommand(input({ productName: '  ' }));

    expect(upsert.mock.calls[0][0].update.productName).toBeNull();
  });

  it('refuses an unknown palette without touching storage or the row', async () => {
    const result = await updateInstanceBrandingCommand(
      input({ palette: 'crimson', logo: PNG }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(upload).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('refuses a name over the limit', async () => {
    const result = await updateInstanceBrandingCommand(
      input({ productName: 'x'.repeat(41) }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a logo that is not an image it serves, whatever it claims', async () => {
    const result = await updateInstanceBrandingCommand(
      input({ logo: new TextEncoder().encode('<html><script/></html>') }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'The logo must be a PNG, JPEG, WebP or SVG image.',
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses an SVG with a script in it', async () => {
    const result = await updateInstanceBrandingCommand(
      input({
        logo: new TextEncoder().encode('<svg><script>alert(1)</script></svg>'),
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads a new logo under a fresh key whose extension names its type', async () => {
    await updateInstanceBrandingCommand(input({ logo: SVG }));

    const [key, body] = upload.mock.calls[0];
    expect(key).toMatch(/^instance-branding\/logo-[0-9a-f-]{36}\.svg$/);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(upsert.mock.calls[0][0].update.logoStorageKey).toBe(key);
  });

  it('deletes the replaced logo only after the row points at the new one', async () => {
    findUnique.mockResolvedValue({
      productName: 'Old',
      primaryToken: 'ocean',
      logoStorageKey: 'instance-branding/logo-old.png',
    });
    const order: string[] = [];
    upsert.mockImplementation(async ({ update }) => {
      order.push('upsert');
      return { ...update };
    });
    remove.mockImplementation(async () => {
      order.push('delete');
    });

    const result = await updateInstanceBrandingCommand(input({ logo: PNG }));

    expect(order).toEqual(['upsert', 'delete']);
    expect(remove).toHaveBeenCalledWith('instance-branding/logo-old.png');
    expect(result).toMatchObject({
      ok: true,
      before: { productName: 'Old', palette: 'ocean', hasLogo: true },
    });
  });

  it('keeps the current logo when none is sent and removal is not asked', async () => {
    findUnique.mockResolvedValue({
      productName: null,
      primaryToken: null,
      logoStorageKey: 'instance-branding/logo-keep.png',
    });
    upsert.mockImplementation(async ({ update }) => ({ ...update }));

    await updateInstanceBrandingCommand(input());

    expect(upsert.mock.calls[0][0].update.logoStorageKey).toBe(
      'instance-branding/logo-keep.png',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the logo when asked, and deletes the object', async () => {
    findUnique.mockResolvedValue({
      productName: null,
      primaryToken: null,
      logoStorageKey: 'instance-branding/logo-gone.png',
    });
    upsert.mockImplementation(async ({ update }) => ({ ...update }));

    const result = await updateInstanceBrandingCommand(
      input({ removeLogo: 'true' }),
    );

    expect(upsert.mock.calls[0][0].update.logoStorageKey).toBeNull();
    expect(remove).toHaveBeenCalledWith('instance-branding/logo-gone.png');
    expect(result).toMatchObject({ ok: true, after: { hasLogo: false } });
  });

  it('a new upload wins over removeLogo sent with it', async () => {
    await updateInstanceBrandingCommand(
      input({ removeLogo: 'true', logo: PNG }),
    );

    expect(upsert.mock.calls[0][0].update.logoStorageKey).toMatch(/\.png$/);
  });

  it('removes its own upload when the row cannot be written', async () => {
    upsert.mockRejectedValue(new Error('db down'));

    await expect(
      updateInstanceBrandingCommand(input({ logo: PNG })),
    ).rejects.toThrow('db down');

    const [key] = upload.mock.calls[0];
    expect(remove).toHaveBeenCalledWith(key);
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('still saves when the old logo cannot be deleted', async () => {
    findUnique.mockResolvedValue({
      productName: null,
      primaryToken: null,
      logoStorageKey: 'instance-branding/logo-old.png',
    });
    upsert.mockImplementation(async ({ update }) => ({ ...update }));
    remove.mockRejectedValue(new Error('s3 down'));

    await expect(
      updateInstanceBrandingCommand(input({ logo: PNG })),
    ).resolves.toMatchObject({ ok: true });
  });
});
