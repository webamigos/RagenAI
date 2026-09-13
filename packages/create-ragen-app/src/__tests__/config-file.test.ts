import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveEncryptionSelection } from '../encryption-provider';
import { patchRagenConfig, renderProviderBlocks } from '../config-file';
import { resolveStorageSelection } from '../storage-provider';

const START = '  // create-ragen-app:providers';
const END = '  // create-ragen-app:providers:end';

const config = (...body: string[]) =>
  ['export default defineConfig({', ...body, '});', ''].join('\n');

const INTACT = config(
  '  models: { chat: process.env.DEFAULT_MODEL },',
  START,
  "  storage: { provider: 'local' },",
  END,
);

describe('patchRagenConfig', () => {
  it('replaces the marked region and leaves the rest alone', () => {
    const patched = patchRagenConfig(
      INTACT,
      [START, '  <block>', END].join('\n'),
    );

    expect(patched).toContain('models: { chat: process.env.DEFAULT_MODEL }');
    expect(patched).toContain('  <block>');
    expect(patched).not.toContain("storage: { provider: 'local' }");
  });

  it('refuses a config with neither marker', () => {
    expect(() => patchRagenConfig(config('  models: {},'), 'x')).toThrow(
      /has no "create-ragen-app:providers" region/,
    );
  });

  it('refuses a config that kept END and lost START', () => {
    // The regression this test exists for. `END` has `START` as a prefix, so
    // a substring search for the start marker matched *inside* the end marker:
    // both were "found", at the same offset, and the END line was quietly
    // replaced by the block. The result parsed and looked plausible.
    expect(() => patchRagenConfig(config('  models: {},', END), 'x')).toThrow(
      /has no "create-ragen-app:providers" region/,
    );
  });

  it('refuses a config that kept START and lost END', () => {
    expect(() => patchRagenConfig(config('  models: {},', START), 'x')).toThrow(
      /has no "create-ragen-app:providers" region/,
    );
  });

  it('refuses an inverted region', () => {
    expect(() =>
      patchRagenConfig(config(END, '  storage: {},', START), 'x'),
    ).toThrow(/has no "create-ragen-app:providers" region/);
  });

  it('is not fooled by the marker text inside a longer line', () => {
    const commented = config(
      `  // see ${START.trim()} in the repository`,
      '  models: {},',
    );

    expect(() => patchRagenConfig(commented, 'x')).toThrow(
      /has no "create-ragen-app:providers" region/,
    );
  });
});

describe('renderProviderBlocks', () => {
  it('gives a required field a fallback and an optional one none', () => {
    // A required field is typed `string`; `process.env.X` alone is
    // `string | undefined` and would not compile.
    const block = renderProviderBlocks(
      resolveStorageSelection('s3', {
        bucket: 'b',
        region: 'r',
        endpoint: 'https://s3.fr-par.scw.cloud',
        accessKeyId: 'k',
        secretAccessKey: 's',
      }),
      resolveEncryptionSelection('none'),
    );

    expect(block).toContain("bucketName: process.env.S3_BUCKET_NAME ?? ''");
    expect(block).toContain('endpoint: process.env.S3_ENDPOINT_URL,');
  });

  it('omits the encryption group when there is none', () => {
    const block = renderProviderBlocks(
      resolveStorageSelection('local'),
      resolveEncryptionSelection('none'),
    );

    expect(block).not.toContain('encryption:');
    expect(block).toContain("provider: 'local'");
  });

  it('writes both groups when encryption is chosen', () => {
    const block = renderProviderBlocks(
      resolveStorageSelection('local'),
      resolveEncryptionSelection('local'),
    );

    expect(block).toContain('storage: {');
    expect(block).toContain('encryption: {');
    expect(block).toContain(
      "masterKey: process.env.ENCRYPTION_MASTER_KEY ?? ''",
    );
  });

  it('round-trips through the patcher', () => {
    const patched = patchRagenConfig(
      INTACT,
      renderProviderBlocks(
        resolveStorageSelection('local'),
        resolveEncryptionSelection('local'),
      ),
    );

    // The markers survive, so a second run of the installer still finds them.
    expect(patched).toContain(START);
    expect(patched).toContain(END);
    expect(() => patchRagenConfig(patched, 'x')).not.toThrow();
  });
});

describe('the config this repository actually ships', () => {
  /**
   * Every case above builds its own fixture, and that is exactly how the
   * markers broke: the fixtures wrote a bare marker line, the real file had
   * explanatory prose appended to the same line, and a whole-line match found
   * neither. The unit tests passed; the installer failed in CI against a real
   * clone, which is the only place the two had ever met.
   *
   * So this reads the file that is actually published.
   */
  const SHIPPED = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    'ragen.config.ts',
  );

  it('has a region the installer can find', () => {
    const source = readFileSync(SHIPPED, 'utf8');

    expect(() => patchRagenConfig(source, 'x')).not.toThrow();
  });

  it('accepts a real rendered block, and stays patchable afterwards', () => {
    const source = readFileSync(SHIPPED, 'utf8');
    const patched = patchRagenConfig(
      source,
      renderProviderBlocks(
        resolveStorageSelection('s3', {
          bucket: 'b',
          region: 'r',
          endpoint: '',
          accessKeyId: 'k',
          secretAccessKey: 's',
        }),
        resolveEncryptionSelection('local'),
      ),
    );

    expect(patched).toContain("provider: 's3'");
    expect(patched).toContain('encryption: {');
    // The groups the wizard does not touch survive.
    expect(patched).toContain('database: {');
    expect(patched).toContain('gateway: {');
    // And a second run still finds its region.
    expect(() => patchRagenConfig(patched, 'x')).not.toThrow();
  });
});
