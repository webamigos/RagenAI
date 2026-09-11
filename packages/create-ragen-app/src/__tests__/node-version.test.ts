import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_NODE_MAJOR,
  checkNodeVersion,
  parseNodeMajor,
} from '../node-version';

const PACKAGE_JSON = join(import.meta.dirname, '..', '..', 'package.json');

describe('REQUIRED_NODE_MAJOR', () => {
  it('matches this package’s own engines field', () => {
    // Two statements of the same requirement, and today's whole exercise was
    // about copies of a value drifting apart. npm reads `engines`; the wizard
    // reads this constant; a user meets whichever fires first.
    const { engines } = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as {
      engines?: { node?: string };
    };

    expect(engines?.node).toBe(`>=${REQUIRED_NODE_MAJOR}`);
  });
});

describe('parseNodeMajor', () => {
  it.each([
    ['v24.20.0', 24],
    ['v22.22.3', 22],
    ['24.0.0', 24],
    ['  v26.1.0  ', 26],
  ])('reads %s as %i', (version, expected) => {
    expect(parseNodeMajor(version)).toBe(expected);
  });

  it.each(['', 'not-a-version', 'v', 'vNN.1.0'])(
    'returns undefined for %o rather than guessing',
    (version) => {
      expect(parseNodeMajor(version)).toBeUndefined();
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

  it('refuses an old Node when it is about to run the setup steps', () => {
    const verdict = checkNodeVersion({
      version: 'v22.22.3',
      willRunSetup: true,
    });

    expect(verdict.kind).toBe('refuse');
    // Both numbers, or the reader cannot tell what to change.
    expect(verdict).toHaveProperty('message', expect.stringContaining('24'));
    expect(verdict).toHaveProperty('message', expect.stringContaining('22'));
    // And the way out, for someone who only wants the files.
    expect(verdict).toHaveProperty(
      'message',
      expect.stringContaining('--skip-install'),
    );
  });

  it('only warns when --skip-install means it runs nothing', () => {
    // The wizard would write files and stop. Refusing there would block a
    // legitimate use — scaffold here, run the setup on a supported Node.
    const verdict = checkNodeVersion({
      version: 'v22.22.3',
      willRunSetup: false,
    });

    expect(verdict.kind).toBe('warn');
    expect(verdict).toHaveProperty('message', expect.stringContaining('24'));
  });

  it('does not refuse a version string it cannot read', () => {
    // Failing open here: an unparseable version is not evidence of an old
    // one, and blocking an install that would have worked is the worse error.
    expect(
      checkNodeVersion({ version: 'something-odd', willRunSetup: true }),
    ).toEqual({ kind: 'ok' });
  });
});
