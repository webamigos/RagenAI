import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EncryptionSelection } from './encryption-provider';
import type { ConfigField, StorageSelection } from './storage-provider';

/**
 * Rewrites the storage and encryption blocks of the cloned `ragen.config.ts`.
 *
 * The config resolves every *value* from `process.env`, so almost nothing in
 * it depends on what the wizard was told. `provider` is the exception: it is a
 * literal, because the type needs a literal to narrow — choosing `'s3'` is
 * what makes the four S3 fields mandatory. Leaving it at `'local'` while
 * writing `STORAGE_PROVIDER=s3` into `.env.local` would leave the two files
 * contradicting each other, with the config quietly wrong about the install it
 * describes.
 *
 * A marked region rather than a regular expression over TypeScript: the
 * markers are ours, they are stable, and the failure mode when they are absent
 * is a thrown error rather than a subtly mangled file. Same shape as the
 * line-matching `applyEnvOverrides` does on `.env.example`, and the block
 * insertion `addLiteLLMModel` does on `config.yaml`.
 */

export const CONFIG_FILENAME = 'ragen.config.ts';

const START = '  // create-ragen-app:providers';
const END = '  // create-ragen-app:providers:end';

/**
 * A required field is typed `string`, so `process.env.X` alone does not
 * compile — it is `string | undefined`. The fallback is a blank rather than a
 * non-null assertion because a blank is *true*: the variable may genuinely be
 * missing, and every reader in `@ragenai/env` treats blank as unset, so the
 * boot-time check reports it instead of a `!` hiding it until something
 * dereferences undefined.
 */
function renderField({ field, envVar, required }: ConfigField): string {
  const value = required
    ? `process.env.${envVar} ?? ''`
    : `process.env.${envVar}`;
  return `    ${field}: ${value},`;
}

function renderGroup(
  group: string,
  provider: string,
  fields: ConfigField[],
): string[] {
  return [
    `  ${group}: {`,
    `    provider: '${provider}',`,
    ...fields.map(renderField),
    '  },',
  ];
}

export function renderProviderBlocks(
  storage: StorageSelection,
  encryption: EncryptionSelection,
): string {
  const lines = [
    START,
    ...renderGroup('storage', storage.provider, storage.configFields),
  ];

  if (encryption.provider !== 'none') {
    lines.push(
      ...renderGroup(
        'encryption',
        encryption.provider,
        encryption.configFields,
      ),
    );
  }

  lines.push(END);
  return lines.join('\n');
}

/**
 * Throws when the markers are missing or out of order, rather than guessing.
 * That happens when the cloned repo and this package have drifted, and a
 * silently unpatched config is exactly the contradiction this function exists
 * to prevent.
 */
export function patchRagenConfig(source: string, block: string): string {
  const start = source.indexOf(START);
  const end = source.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${CONFIG_FILENAME} has no "create-ragen-app:providers" region — the cloned repository and this installer have drifted.`,
    );
  }

  return source.slice(0, start) + block + source.slice(end + END.length);
}

export function writeRagenConfig(
  targetDir: string,
  storage: StorageSelection,
  encryption: EncryptionSelection,
): void {
  const path = join(targetDir, CONFIG_FILENAME);
  const patched = patchRagenConfig(
    readFileSync(path, 'utf8'),
    renderProviderBlocks(storage, encryption),
  );
  writeFileSync(path, patched);
}
