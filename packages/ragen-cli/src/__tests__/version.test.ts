import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readVersion } from '../version';

function packageJson(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ragen-cli-'));
  const path = join(dir, 'package.json');
  writeFileSync(path, contents);
  return path;
}

describe('readVersion', () => {
  it('reads the version out of package.json', () => {
    expect(readVersion(packageJson('{"version":"0.1.0"}'))).toBe('0.1.0');
  });

  it('says unknown rather than throwing when the file is missing', () => {
    // A CLI that cannot find its own manifest should still run its commands.
    expect(readVersion(join(tmpdir(), 'nope', 'package.json'))).toBe('unknown');
  });

  it('says unknown for malformed JSON or a missing version field', () => {
    expect(readVersion(packageJson('not json'))).toBe('unknown');
    expect(readVersion(packageJson('{"name":"ragen"}'))).toBe('unknown');
  });
});
