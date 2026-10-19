import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
const featureEnabled = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { instanceBranding: { findUnique } },
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isInstanceFeatureEnabledQuery: featureEnabled }),
);
vi.mock('@/libs/storage', async () => {
  const { StorageNotFoundError } = await import('@ragenai/storage');
  return {
    getStorageProvider: () => ({ download }),
    StorageNotFoundError,
  };
});

import { StorageNotFoundError } from '@ragenai/storage';

import {
  contentTypeForLogoKey,
  getInstanceBrandingLogoQuery,
} from '../get-instance-branding-logo-query';

describe('contentTypeForLogoKey', () => {
  it.each([
    ['instance-branding/logo-1.png', 'image/png'],
    ['instance-branding/logo-1.jpg', 'image/jpeg'],
    ['instance-branding/logo-1.webp', 'image/webp'],
    ['instance-branding/logo-1.svg', 'image/svg+xml'],
    ['instance-branding/logo-1.SVG', 'image/svg+xml'],
  ])('serves %s as %s', (key, type) => {
    expect(contentTypeForLogoKey(key)).toBe(type);
  });

  it('serves nothing for an extension it never stores', () => {
    expect(contentTypeForLogoKey('instance-branding/logo.html')).toBeNull();
    expect(contentTypeForLogoKey('instance-branding/logo')).toBeNull();
  });
});

describe('getInstanceBrandingLogoQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    featureEnabled.mockResolvedValue(true);
    findUnique.mockResolvedValue({
      logoStorageKey: 'instance-branding/logo-1.png',
    });
    download.mockResolvedValue(Buffer.from('png-bytes'));
  });

  it('returns the stored bytes with the type their key names', async () => {
    await expect(getInstanceBrandingLogoQuery()).resolves.toEqual({
      bytes: Buffer.from('png-bytes'),
      contentType: 'image/png',
    });
    expect(download).toHaveBeenCalledWith('instance-branding/logo-1.png');
  });

  it('serves nothing while the feature key is off', async () => {
    featureEnabled.mockResolvedValue(false);

    await expect(getInstanceBrandingLogoQuery()).resolves.toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it('serves the stored logo regardless for the admin preview', async () => {
    featureEnabled.mockResolvedValue(false);

    await expect(
      getInstanceBrandingLogoQuery({ ignoreFeatureKey: true }),
    ).resolves.not.toBeNull();
    expect(featureEnabled).not.toHaveBeenCalled();
  });

  it('serves nothing when there is no row or no logo', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getInstanceBrandingLogoQuery()).resolves.toBeNull();

    findUnique.mockResolvedValue({ logoStorageKey: null });
    await expect(getInstanceBrandingLogoQuery()).resolves.toBeNull();
  });

  it('serves nothing when the object is missing from storage', async () => {
    download.mockRejectedValue(new StorageNotFoundError('gone'));

    await expect(getInstanceBrandingLogoQuery()).resolves.toBeNull();
  });

  it('lets any other storage failure through, for the route to report', async () => {
    download.mockRejectedValue(new Error('s3 down'));

    await expect(getInstanceBrandingLogoQuery()).rejects.toThrow('s3 down');
  });
});
