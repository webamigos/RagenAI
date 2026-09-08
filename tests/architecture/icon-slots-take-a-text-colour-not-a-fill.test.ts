import { globSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * An icon slot gets its colour from `text-*`, never from `fill-*`.
 *
 * The two Heroicons variants paint differently: outline is
 * `fill="none" stroke="currentColor"`, solid is `fill="currentColor"`. A CSS
 * `fill` beats the presentation attribute `fill="none"`, so
 * `*:data-[slot=icon]:fill-muted-foreground` — the Catalyst pattern, written
 * for Catalyst's own solid icons — silently fills in every outline icon
 * beside them. On the mobile navbar that turned the magnifying glass into a
 * grey disc with a dark ring and the notification bell into a grey blob,
 * while `stroke` went unset and fell back to the inherited near-black.
 *
 * `text-*` is right for both, because both name `currentColor`. A hand-drawn
 * filled glyph joins in by saying `fill="currentColor"` itself, the way
 * SidebarToggleIcon already did and OpenMenuIcon did not.
 *
 * Worth stating why this is a guard and not a comment: it was the third
 * defect of the same shape in `common-ui/Navbar/Navbar.tsx`. The other two
 * were variants that matched nothing — a `data-hover:` that Headless UI never
 * sets, and a slot variant written in the reverse order. All three share one
 * property: the CSS is well-formed, the build is green, and the rule simply
 * does not apply to the element anyone was looking at. Nothing but reading
 * the rendered result finds that, and nobody re-reads a stylesheet that
 * already shipped.
 *
 * See docs/lessons/a-custom-property-override-on-root-loses-to-the-element-that-owns-it.md
 * for the same family in apps/docs.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** A `fill-` utility carrying a colour, on an element matched by icon slot. */
const FILL_ON_AN_ICON_SLOT =
  /data-\[slot=icon\][^'"`\s]*:fill-(?!none\b)[a-z]/g;

function sourceFiles(): string[] {
  return globSync('apps/*/src/**/*.{ts,tsx}', { cwd: REPO_ROOT }).filter(
    (f) => !f.includes('/generated/') && !f.includes('__tests__'),
  );
}

describe('icon slots take a text colour, not a fill', () => {
  const files = sourceFiles();

  it('reads the source it is meant to police', () => {
    // Guard on the guard: a glob that matches nothing passes every case below.
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith('common-ui/Navbar/Navbar.tsx'))).toBe(
      true,
    );
  });

  it('never colours an icon slot with a fill utility', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      for (const match of source.matchAll(FILL_ON_AN_ICON_SLOT)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${relative('.', file)}:${line} — ${match[0]}`);
      }
    }

    expect(
      offenders,
      'A CSS fill overrides `fill="none"`, so this fills in every outline ' +
        'icon it reaches. Colour the slot with `text-*` instead; a filled ' +
        'glyph should declare `fill="currentColor"` on its own <svg>.',
    ).toEqual([]);
  });

  it('fails when a fill utility is reintroduced', () => {
    // The mutation the rule exists to catch, so the case above cannot pass
    // for the wrong reason.
    const mutated =
      "clsx('*:data-[slot=icon]:size-6 *:data-[slot=icon]:fill-muted-foreground')";

    expect([...mutated.matchAll(FILL_ON_AN_ICON_SLOT)]).toHaveLength(1);
    // ...and that `fill-none`, which is legitimate, is not caught.
    expect([
      ...'*:data-[slot=icon]:fill-none'.matchAll(FILL_ON_AN_ICON_SLOT),
    ]).toHaveLength(0);
  });
});
