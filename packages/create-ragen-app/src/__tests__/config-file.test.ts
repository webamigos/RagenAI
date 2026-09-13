import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderRagenConfig } from '../config-template';
import { resolveEncryptionSelection } from '../encryption-provider';
import { resolveStorageSelection } from '../storage-provider';

const S3 = {
  bucket: 'ragen-docs',
  region: 'fr-par',
  endpoint: '',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
};

describe('renderRagenConfig', () => {
  it('writes the groups the wizard never asks about', () => {
    // The template carries the whole file, so these have to be in it — and
    // `ragen-config-is-generated.test.ts` is what keeps them agreeing with
    // the copy this repository ships.
    const rendered = renderRagenConfig(
      resolveStorageSelection('local'),
      resolveEncryptionSelection('none'),
    );

    for (const group of ['database', 'gateway', 'vectorStore', 'models']) {
      expect(rendered).toContain(`${group}: {`);
    }
  });

  it('gives a required field a fallback and an optional one none', () => {
    // A required field is typed `string`; `process.env.X` alone is
    // `string | undefined` and would not compile.
    const rendered = renderRagenConfig(
      resolveStorageSelection('s3', {
        ...S3,
        endpoint: 'https://s3.fr-par.scw.cloud',
      }),
      resolveEncryptionSelection('none'),
    );

    expect(rendered).toContain("bucketName: process.env.S3_BUCKET_NAME ?? ''");
    expect(rendered).toContain('endpoint: process.env.S3_ENDPOINT_URL,');
  });

  it('omits the encryption group when there is none', () => {
    const rendered = renderRagenConfig(
      resolveStorageSelection('local'),
      resolveEncryptionSelection('none'),
    );

    expect(rendered).not.toContain('encryption:');
  });

  it('writes both groups when encryption is chosen', () => {
    const rendered = renderRagenConfig(
      resolveStorageSelection('local'),
      resolveEncryptionSelection('local'),
    );

    expect(rendered).toContain('storage: {');
    expect(rendered).toContain('encryption: {');
    expect(rendered).toContain(
      "masterKey: process.env.ENCRYPTION_MASTER_KEY ?? ''",
    );
  });

  it('never writes an answer into the file, only the variable it arrives in', () => {
    // The whole arrangement depends on this: credentials go to .env.local and
    // the config only names the variable. Sentinel values rather than
    // realistic ones, because a realistic secret shares words with the field
    // names — `secretAccessKey` contains "secret" — and the test would pass or
    // fail for the wrong reason.
    const rendered = renderRagenConfig(
      resolveStorageSelection('s3', {
        bucket: 'BUCKET-SENTINEL',
        region: 'REGION-SENTINEL',
        endpoint: '',
        accessKeyId: 'KEYID-SENTINEL',
        secretAccessKey: 'SECRET-SENTINEL',
      }),
      resolveEncryptionSelection('local'),
    );

    for (const sentinel of [
      'BUCKET-SENTINEL',
      'REGION-SENTINEL',
      'KEYID-SENTINEL',
      'SECRET-SENTINEL',
    ]) {
      expect(rendered).not.toContain(sentinel);
    }

    // ...and the generated encryption key is a 64-character hex string.
    expect(rendered).not.toMatch(/[0-9a-f]{64}/);

    // What it does contain is the variable names.
    expect(rendered).toContain('process.env.S3_SECRET_ACCESS_KEY');
  });

  it('renders a file that is closed and importable', () => {
    const rendered = renderRagenConfig(
      resolveStorageSelection('s3', S3),
      resolveEncryptionSelection('kms', { keyId: 'arn:…', apiKey: '' }),
    );

    expect(
      rendered.startsWith("import { defineConfig } from '@ragenai/env';"),
    ).toBe(true);
    expect(rendered.trimEnd().endsWith('});')).toBe(true);
    expect(rendered.endsWith('\n')).toBe(true);
  });
});

describe('the config this repository ships', () => {
  /**
   * The previous approach patched a marked region in the cloned file, and
   * every test built its own fixture. That is how the markers broke: the
   * fixtures wrote a bare marker line, the shipped file had prose appended to
   * the same line, and a whole-line match found neither. The unit tests
   * passed; the installer failed in CI against a real clone.
   *
   * There is no region to find any more, but the lesson stands — so this
   * reads the file that is actually published.
   */
  const SHIPPED = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    'ragen.config.ts',
  );

  it('is exactly what the template renders for a fresh clone', () => {
    expect(readFileSync(SHIPPED, 'utf8')).toBe(
      renderRagenConfig(
        resolveStorageSelection('local'),
        resolveEncryptionSelection('none'),
      ),
    );
  });
});
