import { generateSecret } from './secrets';
import type { ConfigField } from './storage-provider';

/**
 * Encryption at rest for thread messages and PII (ADR-02, ADR-06).
 *
 * The wizard skipped this too, and the cost of skipping is asymmetric:
 * turning encryption *on* later leaves everything written before it in
 * plaintext, because nothing re-encrypts history. So the one moment it is
 * free to decide is the moment the install is created.
 *
 * `local` is offered first because it costs the user nothing —
 * `generateSecret()` already produces a 64-character hex string, which is
 * exactly what `parseMasterKey` in `@ragenai/crypto` accepts. No account, no
 * console, no copy-paste.
 *
 * The variable names mirror `ENCRYPTION_SEAM` in `@ragenai/env`, copied rather
 * than imported for the reason given in `storage-provider.ts`, and held to the
 * original by `tests/architecture/create-ragen-app-knows-the-provider-seams.test.ts`.
 */

export type EncryptionChoice = 'none' | 'local' | 'scaleway' | 'kms';

export const ENCRYPTION_LABELS: Record<EncryptionChoice, string> = {
  local: 'Yes — generate a key for me (recommended)',
  scaleway: 'Yes — Scaleway Key Manager (I have a key id)',
  kms: 'Yes — AWS KMS (I have a key id)',
  none: 'No — store messages and documents in plaintext',
};

export interface EncryptionAnswers {
  /** Scaleway: Key Manager key id. KMS: the key id or ARN. */
  keyId: string;
  /** Scaleway only. */
  apiKey: string;
}

export interface EncryptionSelection {
  provider: EncryptionChoice;
  envUpdates: Record<string, string>;
  configFields: ConfigField[];
  /** True when the wizard minted the key, so the CLI can say where it went. */
  generatedKey: boolean;
}

const NOTHING: Pick<EncryptionSelection, 'envUpdates' | 'configFields'> = {
  envUpdates: {},
  configFields: [],
};

export function resolveEncryptionSelection(
  provider: EncryptionChoice,
  answers?: EncryptionAnswers,
): EncryptionSelection {
  if (provider === 'none') {
    // Deliberately writes nothing rather than `ENCRYPTION_PROVIDER=none`:
    // there is no such provider, and `@ragenai/crypto` decides by looking for
    // credentials. An unset variable is the honest way to say "not
    // configured", and it is what a deployed environment refuses to start on.
    return { provider, ...NOTHING, generatedKey: false };
  }

  if (provider === 'local') {
    return {
      provider,
      envUpdates: {
        ENCRYPTION_PROVIDER: 'local',
        ENCRYPTION_MASTER_KEY: generateSecret(),
      },
      configFields: [
        { field: 'masterKey', envVar: 'ENCRYPTION_MASTER_KEY', required: true },
      ],
      generatedKey: true,
    };
  }

  const keyId = answers?.keyId.trim() ?? '';
  const apiKey = answers?.apiKey.trim() ?? '';

  if (provider === 'kms') {
    return {
      provider,
      envUpdates: { ENCRYPTION_PROVIDER: 'kms', AWS_KMS_KEY_ID: keyId },
      configFields: [
        { field: 'keyId', envVar: 'AWS_KMS_KEY_ID', required: true },
      ],
      generatedKey: false,
    };
  }

  return {
    provider: 'scaleway',
    envUpdates: {
      ENCRYPTION_PROVIDER: 'scaleway',
      SCW_KEY_MANAGER_KEY_ID: keyId,
      SCW_API_KEY: apiKey,
    },
    configFields: [
      { field: 'keyId', envVar: 'SCW_KEY_MANAGER_KEY_ID', required: true },
      { field: 'apiKey', envVar: 'SCW_API_KEY', required: true },
    ],
    generatedKey: false,
  };
}
