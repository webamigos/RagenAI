import { describe, expect, it } from 'vitest';

import {
  instanceBrandingInputSchema,
  productNameSchema,
} from '../branding.schemas';

describe('productNameSchema', () => {
  it('trims a valid name', () => {
    expect(productNameSchema.parse('  Acme Knowledge ')).toBe('Acme Knowledge');
  });

  it('reads an empty name as "use the default"', () => {
    expect(productNameSchema.parse('')).toBeNull();
    expect(productNameSchema.parse('    ')).toBeNull();
  });

  it('accepts exactly forty characters and refuses forty-one', () => {
    expect(productNameSchema.safeParse('a'.repeat(40)).success).toBe(true);
    const result = productNameSchema.safeParse('a'.repeat(41));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('40');
  });

  it('refuses control characters, which would reach titles and subjects', () => {
    expect(productNameSchema.safeParse('Acme\nBcc: x').success).toBe(false);
    expect(productNameSchema.safeParse('Acme\u0000').success).toBe(false);
  });

  it('accepts markup as text — React escapes it wherever it is drawn', () => {
    expect(productNameSchema.parse('<b>Acme</b>')).toBe('<b>Acme</b>');
  });

  it('refuses a value that is not a string', () => {
    expect(productNameSchema.safeParse(42).success).toBe(false);
  });
});

describe('instanceBrandingInputSchema', () => {
  it('accepts a full, valid save', () => {
    expect(
      instanceBrandingInputSchema.parse({
        productName: 'Acme',
        palette: 'violet',
        removeLogo: 'true',
      }),
    ).toEqual({ productName: 'Acme', palette: 'violet', removeLogo: true });
  });

  it('reads the strings and booleans a form can send for removeLogo', () => {
    const parse = (removeLogo: unknown) =>
      instanceBrandingInputSchema.parse({
        productName: '',
        palette: 'ragen',
        removeLogo,
      }).removeLogo;

    expect(parse('true')).toBe(true);
    expect(parse(true)).toBe(true);
    expect(parse('false')).toBe(false);
    expect(parse(false)).toBe(false);
    expect(parse(undefined)).toBe(false);
  });

  it.each(['crimson', 'green', '', 'RAGEN', 'var(--x)'])(
    'refuses %j as a palette',
    (palette) => {
      const result = instanceBrandingInputSchema.safeParse({
        productName: 'Acme',
        palette,
      });
      expect(result.success).toBe(false);
    },
  );

  it('refuses a missing palette rather than guessing one', () => {
    expect(
      instanceBrandingInputSchema.safeParse({ productName: 'Acme' }).success,
    ).toBe(false);
  });

  it('refuses a removeLogo value a checkbox cannot send', () => {
    expect(
      instanceBrandingInputSchema.safeParse({
        productName: 'Acme',
        palette: 'ragen',
        removeLogo: 'yes',
      }).success,
    ).toBe(false);
  });
});
