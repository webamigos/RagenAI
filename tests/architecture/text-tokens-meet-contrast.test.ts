import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every text token has to be readable on the surface it is used on.
 *
 * This exists because `--muted-foreground` spent a long time at 4.37:1 on the
 * application ground, and the only way anybody noticed was reading a status
 * pill and a section heading and thinking they looked faint. A ratio is not
 * something an eye reports reliably: 4.37 and 4.74 look identical, one fails
 * WCAG AA for body text and the other passes with no margin.
 *
 * The palette is defined once, in `apps/web`'s `global.css`, so it can be
 * measured once. This reads the file, resolves the role tokens through the
 * ramp, and computes the real ratio.
 *
 * **What it cannot see.** A colour composited at runtime — a tint, an opacity
 * utility like `bg-muted/50`, a `color-mix` in a component stylesheet — is
 * not in this file and is not measured here. Tinting a surface with the same
 * hue as the text on it always costs contrast, and that has to be measured
 * where it is written.
 */

const CSS_PATH = join(process.cwd(), 'apps/web/src/app/[locale]/global.css');

/** WCAG AA for text below 18.66px, which is all of this application's copy. */
const MINIMUM_RATIO = 4.5;

type Rgb = readonly [number, number, number];

function oklchToSrgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];
}

function hexToLinearSrgb(hex: string): Rgb {
  const full =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : hex.slice(1);

  const channel = (offset: number) => {
    const v = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  return [channel(0), channel(2), channel(4)];
}

function relativeLuminance([r, g, b]: Rgb): number {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const css = readFileSync(CSS_PATH, 'utf8');

/** The declarations inside one `{ … }` block, by token name. */
function declarationsIn(openingLine: string): Map<string, string> {
  const start = css.indexOf(openingLine);
  if (start === -1) {
    throw new Error(`No \`${openingLine}\` block in global.css`);
  }
  const end = css.indexOf('\n}', start);
  const block = css.slice(start, end);

  const found = new Map<string, string>();
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    // A token may be declared twice in a block; the last one wins, as in CSS.
    found.set(match[1], match[2].split('/*')[0].trim());
  }
  return found;
}

const ramp = declarationsIn('@theme {');
const lightRoles = declarationsIn(':root {');
const darkRoles = declarationsIn('.dark {');

function resolve(
  value: string | undefined,
  roles: Map<string, string>,
  depth = 0,
): Rgb {
  if (value === undefined) {
    throw new Error('Token is not declared');
  }
  if (depth > 8) {
    throw new Error(`Token reference loops: ${value}`);
  }

  const reference = /^var\(--([a-z0-9-]+)(?:,.*)?\)$/.exec(value);
  if (reference) {
    const name = reference[1];
    return resolve(roles.get(name) ?? ramp.get(name), roles, depth + 1);
  }

  if (value.startsWith('#')) {
    return hexToLinearSrgb(value);
  }

  const oklch = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
  if (oklch) {
    return oklchToSrgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  }

  throw new Error(`Cannot read colour \`${value}\``);
}

/**
 * Text token on surface token. Every pair here is a combination the panel
 * actually renders; `--muted-foreground` gets one row per surface because it
 * is the secondary-text token and lands on all of them.
 */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'popover'],
  ['muted-foreground', 'secondary'],
  ['muted-foreground', 'sidebar'],
  // Citation markers and the numbers beside them in the sources block. The
  // colour is rationed to crimson by the panel rules, so it is the one
  // accent that appears as small text and has to be checked as text.
  ['marker', 'card'],
  ['marker', 'muted'],
];

describe.each([
  ['light', lightRoles],
  ['dark', darkRoles],
])('%s palette', (_mode, roles) => {
  it.each(PAIRS)('%s on %s reaches AA', (text, surface) => {
    const ratio = contrastRatio(
      resolve(roles.get(text), roles),
      resolve(roles.get(surface), roles),
    );

    // The comparison is on the unrounded ratio: 4.497 rounds to 4.50 and
    // would pass a check on the rounded value while failing WCAG. Rounding
    // is for the message, which reports how far off it is — the number you
    // need to pick the next ramp step.
    expect(
      ratio,
      `--${text} on --${surface} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(MINIMUM_RATIO);
  });
});

describe('the measurement itself', () => {
  it('agrees with WCAG on the two ratios everyone knows', () => {
    const white = hexToLinearSrgb('#ffffff');
    const black = hexToLinearSrgb('#000000');
    const midGrey = hexToLinearSrgb('#767676');

    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    // #767676 on white is the canonical "just passes AA" grey.
    expect(contrastRatio(midGrey, white)).toBeCloseTo(4.54, 2);
  });

  it('does not let a rounded ratio pass for a real one', () => {
    // The regression this guards: comparing `Number(ratio.toFixed(2))` would
    // round 4.497 up to 4.50 and call it a pass. Two greys chosen to land
    // just under the threshold.
    const white = hexToLinearSrgb('#ffffff');
    const justUnder = hexToLinearSrgb('#777777');

    const ratio = contrastRatio(justUnder, white);
    expect(ratio).toBeLessThan(MINIMUM_RATIO);
    expect(Number(ratio.toFixed(1))).toBeGreaterThanOrEqual(MINIMUM_RATIO);
  });

  it('reads both notations the palette is written in', () => {
    // paper-950 is oklch, brand-600 is hex; both have to resolve.
    expect(resolve('var(--color-paper-950)', lightRoles)).toHaveLength(3);
    expect(resolve('var(--color-brand-600)', lightRoles)).toHaveLength(3);
  });
});
