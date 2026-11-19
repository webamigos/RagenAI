import { beforeEach, describe, expect, it, vi } from 'vitest';

const branding = vi.hoisted(() => vi.fn());
const baseUrl = vi.hoisted(() => vi.fn());

vi.mock('../get-instance-branding-query', () => ({
  getInstanceBrandingQuery: branding,
}));
vi.mock('@/app/emails/utils/base-url', () => ({ getBaseUrl: baseUrl }));

import { getEmailBrandingQuery } from '../get-email-branding-query';

describe('getEmailBrandingQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseUrl.mockReturnValue('https://ragen.acme.test');
  });

  it('makes the logo absolute, since a mail client has no page to resolve it against', async () => {
    branding.mockResolvedValue({
      productName: 'Acme',
      logoUrl: '/api/branding/logo?v=7',
      palette: 'violet',
      isCustom: true,
    });

    await expect(getEmailBrandingQuery()).resolves.toEqual({
      productName: 'Acme',
      logoUrl: 'https://ragen.acme.test/api/branding/logo?v=7',
      isCustom: true,
    });
  });

  it('carries no logo URL when none was uploaded', async () => {
    branding.mockResolvedValue({
      productName: 'Ragen AI',
      logoUrl: null,
      palette: 'ragen',
      isCustom: false,
    });

    await expect(getEmailBrandingQuery()).resolves.toEqual({
      productName: 'Ragen AI',
      logoUrl: null,
      isCustom: false,
    });
    expect(baseUrl).not.toHaveBeenCalled();
  });

  it('drops the logo, not the email, when the origin is not configured', async () => {
    branding.mockResolvedValue({
      productName: 'Acme',
      logoUrl: '/api/branding/logo?v=7',
      palette: 'ragen',
      isCustom: true,
    });
    baseUrl.mockImplementation(() => {
      throw new Error('APP_URL must be set');
    });

    await expect(getEmailBrandingQuery()).resolves.toMatchObject({
      productName: 'Acme',
      logoUrl: null,
    });
  });
});
