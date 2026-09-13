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
