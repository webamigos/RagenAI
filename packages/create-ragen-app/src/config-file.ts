import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILENAME, renderRagenConfig } from './config-template';
import type { EncryptionSelection } from './encryption-provider';
import type { StorageSelection } from './storage-provider';

/**
 * Writes the configuration the wizard was told to set up.
 *
 * Overwrites rather than patches. The cloned file is a generated artifact of
 * the same template (see `config-template.ts`), so there is nothing in it
 * worth preserving that this does not already produce — and nothing to locate,
 * which is where every previous defect in this file lived.
 */
export function writeRagenConfig(
  targetDir: string,
  storage: StorageSelection,
  encryption: EncryptionSelection,
): void {
  writeFileSync(
    join(targetDir, CONFIG_FILENAME),
    renderRagenConfig(storage, encryption),
  );
}

export { CONFIG_FILENAME, renderRagenConfig };
