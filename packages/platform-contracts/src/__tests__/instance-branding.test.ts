import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INSTANCE_PALETTE,
  INSTANCE_PALETTES,
  INSTANCE_PALETTE_OPTIONS,
  LOGO_MAX_BYTES,
  checkLogo,
  detectLogoType,
  findUnsafeSvgConstruct,
  isInstancePalette,
} from '../branding/instance-branding';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ');
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/><use href="#g"/></svg>';

describe('palettes', () => {
  it('starts with the default, which is today’s navy', () => {
    expect(INSTANCE_PALETTES[0]).toBe(DEFAULT_INSTANCE_PALETTE);
    expect(INSTANCE_PALETTE_OPTIONS.ragen.swatch).toBe('#394d9d');
  });

  it('describes every palette it offers', () => {
    expect(Object.keys(INSTANCE_PALETTE_OPTIONS).sort()).toEqual(
      [...INSTANCE_PALETTES].sort(),
    );
    for (const id of INSTANCE_PALETTES) {
      expect(INSTANCE_PALETTE_OPTIONS[id].swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('offers no crimson, green or amber primary (panel rules 16 and 17)', () => {
    for (const id of INSTANCE_PALETTES) {
      expect(id).not.toMatch(/crimson|red|green|amber/);
    }
  });

  it('recognises only its own ids', () => {
    expect(isInstancePalette('violet')).toBe(true);
    expect(isInstancePalette('crimson')).toBe(false);
    expect(isInstancePalette('')).toBe(false);
    expect(isInstancePalette(undefined)).toBe(false);
    expect(isInstancePalette(3)).toBe(false);
  });
});

describe('detectLogoType', () => {
  it.each([
    ['png', PNG],
    ['jpeg', JPEG],
    ['webp', WEBP],
    ['svg', text(SVG)],
    ['svg', text(`\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n${SVG}`)],
  ])('reads %s from its content', (expected, input) => {
    expect(detectLogoType(input)).toBe(expected);
  });

  it('does not trust a name or a claim, only bytes', () => {
    expect(detectLogoType(text('GIF89a……'))).toBeNull();
    expect(detectLogoType(text('<html><svg></svg></html>'))).toBeNull();
    expect(detectLogoType(text('%PDF-1.7'))).toBeNull();
    expect(detectLogoType(new Uint8Array())).toBeNull();
  });
});

describe('findUnsafeSvgConstruct', () => {
  it('lets a plain drawing with internal references through', () => {
    expect(findUnsafeSvgConstruct(SVG)).toBeNull();
  });

  it.each([
    '<svg><use href= "#g"/></svg>',
    '<svg><rect fill="url( \'#g\')"/></svg>',
  ])('lets an internal reference with whitespace through: %s', (svg) => {
    expect(findUnsafeSvgConstruct(svg)).toBeNull();
  });

  it.each([
    ['<svg><script>alert(1)</script></svg>', 'script'],
    ['<svg><SCRIPT >alert(1)</SCRIPT></svg>', 'script'],
    [
      '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>x</s:script></svg>',
      'script',
    ],
    ['<svg><x:foreignObject><div/></x:foreignObject></svg>', 'foreignObject'],
    ['<svg onload="alert(1)"></svg>', 'event-handler'],
    ['<svg><rect onclick = "x()"/></svg>', 'event-handler'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'foreignObject'],
    ['<svg><a href="javascript:alert(1)">x</a></svg>', 'script URL'],
    ['<svg><a href=" https://evil.example">x</a></svg>', 'outside'],
    ["<svg><a href='https://evil.example'>x</a></svg>", 'outside'],
    ['<svg><a xlink:href="https://evil.example">x</a></svg>', 'outside'],
    ['<svg><image href="https://track.example/p.png"/></svg>', 'image'],
    ['<svg><use href="data:image/svg+xml,…"/></svg>', 'outside'],
    ['<svg><style>@import "https://x";</style></svg>', 'import'],
    ['<svg><rect style="fill:url(https://x/a.svg#g)"/></svg>', 'url()'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg/>', 'DTD'],
    ['<svg><iframe src="/"/></svg>', 'embedded document'],
    ['<svg><set attributeName="href" to="javascript:x"/></svg>', 'animation'],
  ])('refuses %s', (svg, named) => {
    expect(findUnsafeSvgConstruct(svg)).toContain(named);
  });
});

describe('checkLogo', () => {
  it('accepts each supported type and names its content type and extension', () => {
    expect(checkLogo(PNG)).toEqual({
      ok: true,
      type: 'png',
      contentType: 'image/png',
      extension: 'png',
    });
    expect(checkLogo(JPEG)).toMatchObject({ ok: true, extension: 'jpg' });
    expect(checkLogo(WEBP)).toMatchObject({
      ok: true,
      contentType: 'image/webp',
    });
    expect(checkLogo(text(SVG))).toMatchObject({
      ok: true,
      contentType: 'image/svg+xml',
      extension: 'svg',
    });
  });

  it('refuses an empty file', () => {
    expect(checkLogo(new Uint8Array())).toMatchObject({ ok: false });
  });

  it('refuses a file over the limit, and says what the limit is', () => {
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    const result = checkLogo(big);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('512 KB');
  });

  it('accepts a file of exactly the limit', () => {
    const exact = new Uint8Array(LOGO_MAX_BYTES);
    exact.set(PNG);
    expect(checkLogo(exact).ok).toBe(true);
  });

  it('refuses a type it does not serve', () => {
    expect(checkLogo(text('GIF89a'))).toMatchObject({ ok: false });
  });

  it('refuses an SVG that carries a script, and says why', () => {
    const result = checkLogo(text('<svg><script>x</script></svg>'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('<script>');
  });
});
