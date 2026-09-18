import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_NODE_VERSION,
  SUPPORTED_NODE_ENGINES_RANGE,
  checkNodeVersion,
  parseNodeVersion,
} from '../node-version';

const PACKAGE_JSON = join(import.meta.dirname, '..', '..', 'package.json');
const ROOT_PACKAGE_JSON = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'package.json',
);

function enginesNode(path: string): string | undefined {
  const { engines } = JSON.parse(readFileSync(path, 'utf8')) as {
    engines?: { node?: string };
  };
  return engines?.node;
}

describe('SUPPORTED_NODE_RANGES', () => {
  it('renders to this package’s own engines field', () => {
    // Two statements of the same requirement, and the whole exercise here was
    // about copies of a value drifting apart. npm reads `engines`; the wizard
    // reads the table; a user meets whichever fires first.
    expect(enginesNode(PACKAGE_JSON)).toBe(SUPPORTED_NODE_ENGINES_RANGE);
  });

  it('renders to the engines field of the repository it installs', () => {
    // The one that actually failed: the wizard's check was right about the
    // CLI and wrong about the tree it clones, so it cleared 24.13 and then
    // `npm install` stopped on it. This package is published from the same
    // repository, so the cloned root is the file above us.
    expect(enginesNode(ROOT_PACKAGE_JSON)).toBe(SUPPORTED_NODE_ENGINES_RANGE);
  });

  it('is a range with a gap, not a minimum', () => {
    // `>=24.15.0` was the second wrong answer. It fixes the patch digit and
    // still accepts Node 25, which jsdom's range omits entirely.
    expect(SUPPORTED_NODE_ENGINES_RANGE).toContain('||');
    expect(REQUIRED_NODE_VERSION).toBe('24.15.0');
  });
});

describe('parseNodeVersion', () => {
  it.each([
    ['v24.20.0', { major: 24, minor: 20, patch: 0 }],
    ['v22.22.3', { major: 22, minor: 22, patch: 3 }],
    ['24.0.0', { major: 24, minor: 0, patch: 0 }],
    ['  v26.1.0  ', { major: 26, minor: 1, patch: 0 }],
    [
      'v24.15.0-nightly',
      { major: 24, minor: 15, patch: 0, prerelease: 'nightly' },
    ],
    ['v25.0.0-rc.1', { major: 25, minor: 0, patch: 0, prerelease: 'rc.1' }],
  ])('reads %s as %o', (version, expected) => {
    // The prerelease tail is kept, not discarded. Dropping it would make
    // `24.15.0-nightly` compare equal to `24.15.0`, and semver puts it below —
    // which is the difference between accepting a Node and accepting one whose
    // `npm install` fails.
    expect(parseNodeVersion(version)).toEqual(expected);
  });

  it.each(['', 'not-a-version', 'v', 'vNN.1.0', 'v24', 'v24.15'])(
    'returns undefined for %o rather than guessing',
    (version) => {
      // Including the two that look almost right: reading `v24.15` as 24.15.0
      // would invent a patch digit, and the patch digit is the requirement.
      expect(parseNodeVersion(version)).toBeUndefined();
    },
  );
});

describe('checkNodeVersion', () => {
  it('passes a supported Node', () => {
    expect(
      checkNodeVersion({ version: 'v24.20.0', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });

  it('passes a newer LTS major, rather than pinning to one release line', () => {
    expect(
      checkNodeVersion({ version: 'v26.0.0', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
    expect(
      checkNodeVersion({ version: 'v28.4.1', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });

  // The second half of the boundary, and the one a floor cannot express.
  // jsdom's range is `^22.22.2 || ^24.15.0 || >=26.0.0`: Node 25 satisfies
  // none of it, so `>=24.15.0` would clear a Node that `npm install` rejects —
  // the original bug with a different number.
  it.each(['v25.0.0', 'v25.9.9'])(
    'refuses %s, which is newer than the minimum and still unsupported',
    (version) => {
      const verdict = checkNodeVersion({ version, willRunSetup: true });

      expect(verdict.kind).toBe('refuse');
      // Not "too old" — that would send someone to upgrade, which is what
      // they already did.
      expect(verdict).toHaveProperty(
        'message',
        expect.stringContaining('newer than the minimum'),
      );
      expect(verdict).toHaveProperty(
        'message',
        expect.stringContaining('25.x'),
      );
    },
  );

  // The boundary this whole change exists for. 24.14 and 24.15 differ by a
  // patch digit and by whether `npm install` completes at all, and every
  // check in this repository treated them as the same thing.
  it('refuses the last Node the install cannot use', () => {
    expect(
      checkNodeVersion({ version: 'v24.14.0', willRunSetup: true }).kind,
    ).toBe('refuse');
  });

  it('accepts the first Node the install can use', () => {
    expect(
      checkNodeVersion({ version: 'v24.15.0', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });

  it('refuses the reported case, and says why the major is not enough', () => {
    const verdict = checkNodeVersion({
      version: 'v24.13.0',
      willRunSetup: true,
    });

    expect(verdict.kind).toBe('refuse');
    // Both versions, or the reader cannot tell what to change.
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('24.15.0'),
    );
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('24.13.0'),
    );
    // And the reason, which is the part someone who already has Node 24
    // needs: without it the refusal reads as a bug in the installer.
    expect(verdict).toHaveProperty('message', expect.stringContaining('jsdom'));
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('engine-strict'),
    );
    // And the way out, for someone who only wants the files.
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('--skip-install'),
    );
  });

  it('refuses an older major too', () => {
    const verdict = checkNodeVersion({
      version: 'v22.22.3',
      willRunSetup: true,
    });

    expect(verdict.kind).toBe('refuse');
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('22.22.3'),
    );
  });

  it('only warns when --skip-install means it runs nothing', () => {
    // The wizard would write files and stop. Refusing there would block a
    // legitimate use — scaffold here, run the setup on a supported Node.
    const verdict = checkNodeVersion({
      version: 'v24.13.0',
      willRunSetup: false,
    });

    expect(verdict.kind).toBe('warn');
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('24.15.0'),
    );
    expect(verdict).toHaveProperty('message', expect.stringContaining('jsdom'));
  });

  // npm checks engines with `includePrerelease: true`, so these verdicts were
  // taken from `semver.satisfies(v, '^24.15.0 || >=26.0.0', {includePrerelease: true})`
  // rather than reasoned about — the point is to agree with the tool that
  // will actually stop the install.
  describe('prereleases, as npm sees them', () => {
    it.each([
      // A prerelease of a range's own starting version sorts *below* it.
      ['v24.15.0-nightly', 'refuse'],
      ['v26.0.0-rc.1', 'refuse'],
      // One above a range's start is inside it.
      ['v24.16.0-rc.1', 'ok'],
      ['v27.0.0-nightly', 'ok'],
    ])('%s → %s, matching npm', (version, expected) => {
      expect(checkNodeVersion({ version, willRunSetup: true }).kind).toBe(
        expected,
      );
    });

    it('says the version is a prerelease, not that it is too old', () => {
      // `24.15.0-nightly` and the required `24.15.0` look identical at a
      // glance, so a refusal that only prints both numbers reads as a bug.
      const verdict = checkNodeVersion({
        version: 'v24.15.0-nightly',
        willRunSetup: true,
      });

      expect(verdict).toHaveProperty(
        'message',
        expect.stringContaining('prerelease'),
      );
      expect(verdict).toHaveProperty(
        'message',
        expect.stringContaining('24.15.0-nightly'),
      );
    });

    it('refuses a prerelease of an unsupported line, where npm would allow it', () => {
      // The one deliberate difference, in the safe direction: npm accepts
      // `25.0.0-rc.1` because it sorts below the `<25.0.0` bound, but the
      // *released* 25 line is unsupported — so an install scaffolded on the
      // release candidate would work today and stop working at 25.0.0 final.
      expect(
        checkNodeVersion({ version: 'v25.0.0-rc.1', willRunSetup: true }).kind,
      ).toBe('refuse');
    });
  });

  it('does not refuse a version string it cannot read', () => {
    // Failing open here: an unparseable version is not evidence of an old
    // one, and blocking an install that would have worked is the worse error.
    expect(
      checkNodeVersion({ version: 'something-odd', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });
});
