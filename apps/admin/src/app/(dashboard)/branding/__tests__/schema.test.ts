import { describe, expect, it } from 'vitest';

import { brandingFormSchema, readBrandingForm } from '../schema';

describe('brandingFormSchema', () => {
  it('accepts every palette platform-contracts declares', () => {
    for (const palette of ['ragen', 'ocean', 'petrol', 'violet', 'graphite']) {
      expect(
        brandingFormSchema.safeParse({
          productName: '',
          palette,
          removeLogo: false,
        }).success,
      ).toBe(true);
    }
  });

  it.each(['crimson', 'Ragen', '', '#ff0000'])(
    'refuses %j as a palette',
    (palette) => {
      expect(
        brandingFormSchema.safeParse({
          productName: '',
          palette,
          removeLogo: false,
        }).success,
      ).toBe(false);
    },
  );

  it('trims the name and holds it to forty characters', () => {
    expect(
      brandingFormSchema.parse({
        productName: '  Acme  ',
        palette: 'ragen',
        removeLogo: false,
      }).productName,
    ).toBe('Acme');
    expect(
      brandingFormSchema.safeParse({
        productName: 'a'.repeat(41),
        palette: 'ragen',
        removeLogo: false,
      }).success,
    ).toBe(false);
  });
});

describe('readBrandingForm', () => {
  it('reads a form, with removeLogo true only for the string "true"', () => {
    const form = new FormData();
    form.set('productName', 'Acme');
    form.set('palette', 'ocean');
    form.set('removeLogo', 'true');

    expect(readBrandingForm(form).data).toEqual({
      productName: 'Acme',
      palette: 'ocean',
      removeLogo: true,
    });

    form.set('removeLogo', 'on');
    expect(readBrandingForm(form).data?.removeLogo).toBe(false);
  });

  it('treats a missing name as empty, meaning the default', () => {
    const form = new FormData();
    form.set('palette', 'ragen');

    expect(readBrandingForm(form).data?.productName).toBe('');
  });

  it('fails a form with no palette', () => {
    expect(readBrandingForm(new FormData()).success).toBe(false);
  });
});
