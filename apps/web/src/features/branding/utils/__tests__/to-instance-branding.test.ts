import { describe, expect, it } from 'vitest';

import { DEFAULT_INSTANCE_BRANDING } from '../../contracts/branding.types';
import { toInstanceBranding } from '../to-instance-branding';

const UPDATED = new Date('2026-10-19T10:00:00Z');

const row = (fields: Partial<Parameters<typeof toInstanceBranding>[0]>) => ({
  productName: null,
  logoStorageKey: null,
  primaryToken: null,
  updatedAt: UPDATED,
  ...fields,
});

describe('toInstanceBranding', () => {
  it('is today’s Ragen branding when there is no row (spec: existing installs see no change)', () => {
    expect(toInstanceBranding(null)).toEqual(DEFAULT_INSTANCE_BRANDING);
    expect(DEFAULT_INSTANCE_BRANDING).toEqual({
      productName: 'Ragen AI',
      logoUrl: null,
      palette: 'ragen',
      isCustom: false,
    });
  });

  it('is today’s branding for a row whose every field is empty', () => {
    expect(toInstanceBranding(row({}))).toEqual(DEFAULT_INSTANCE_BRANDING);
  });

  it('uses each stored field, and versions the logo URL by the save time', () => {
    expect(
      toInstanceBranding(
        row({
          productName: 'Acme Knowledge',
          logoStorageKey: 'instance-branding/logo-1.png',
          primaryToken: 'violet',
        }),
      ),
    ).toEqual({
      productName: 'Acme Knowledge',
      logoUrl: `/api/branding/logo?v=${UPDATED.getTime()}`,
      palette: 'violet',
      isCustom: true,
    });
  });

  it('falls back field by field, so one bad value does not cost the others', () => {
    const branding = toInstanceBranding(
      row({ productName: '   ', primaryToken: 'crimson-from-the-future' }),
    );
    expect(branding.productName).toBe('Ragen AI');
    expect(branding.palette).toBe('ragen');
    expect(branding.isCustom).toBe(false);
  });

  it.each([
    ['a name', { productName: 'Acme' }],
    ['a logo', { logoStorageKey: 'instance-branding/logo.svg' }],
    ['a palette', { primaryToken: 'graphite' }],
  ])('counts %s alone as custom', (_label, fields) => {
    expect(toInstanceBranding(row(fields)).isCustom).toBe(true);
  });

  it('trims the stored name', () => {
    expect(
      toInstanceBranding(row({ productName: '  Acme ' })).productName,
    ).toBe('Acme');
  });
});
