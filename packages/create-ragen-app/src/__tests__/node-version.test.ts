import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_NODE_VERSION,
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

describe('REQUIRED_NODE_VERSION', () => {
  it('matches this package’s own engines field', () => {
    // Two statements of the same requirement, and the whole exercise here was
    // about copies of a value drifting apart. npm reads `engines`; the wizard
    // reads this constant; a user meets whichever fires first.
    expect(enginesNode(PACKAGE_JSON)).toBe(`>=${REQUIRED_NODE_VERSION}`);
  });

  it('matches the engines field of the repository it installs', () => {
    // The one that actually failed: the wizard's floor was right about the
    // CLI and wrong about the tree it clones, so it cleared 24.13 and then
    // `npm install` stopped on it. This package is published from the same
    // repository, so the cloned root is the file above us.
    expect(enginesNode(ROOT_PACKAGE_JSON)).toBe(`>=${REQUIRED_NODE_VERSION}`);
  });
});

describe('parseNodeVersion', () => {
  it.each([
    ['v24.20.0', { major: 24, minor: 20, patch: 0 }],
    ['v22.22.3', { major: 22, minor: 22, patch: 3 }],
    ['24.0.0', { major: 24, minor: 0, patch: 0 }],
    ['  v26.1.0  ', { major: 26, minor: 1, patch: 0 }],
    ['v24.15.0-nightly', { major: 24, minor: 15, patch: 0 }],
  ])('reads %s as %o', (version, expected) => {
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

  it('passes a newer major, rather than pinning to one release line', () => {
    expect(
      checkNodeVersion({ version: 'v26.0.0', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });

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

  it('does not refuse a version string it cannot read', () => {
    // Failing open here: an unparseable version is not evidence of an old
    // one, and blocking an install that would have worked is the worse error.
    expect(
      checkNodeVersion({ version: 'something-odd', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });
});
