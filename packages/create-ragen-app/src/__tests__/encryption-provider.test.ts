import { describe, expect, it } from 'vitest';

import { resolveEncryptionSelection } from '../encryption-provider';

describe('no encryption', () => {
  it('writes nothing at all', () => {
    // Not `ENCRYPTION_PROVIDER=none`: there is no such provider, and
    // @ragenai/crypto decides by looking for credentials. Unset is the honest
    // way to say "not configured", and what a deployment refuses to start on.
    const selection = resolveEncryptionSelection('none');

    expect(selection.envUpdates).toEqual({});
    expect(selection.generatedKey).toBe(false);
  });
});

describe('local encryption', () => {
  it('generates a key the crypto package will accept', () => {
    // parseMasterKey wants 32 bytes: 64 hex characters, or base64.
    const { envUpdates, generatedKey } = resolveEncryptionSelection('local');

    expect(envUpdates.ENCRYPTION_PROVIDER).toBe('local');
    expect(envUpdates.ENCRYPTION_MASTER_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(generatedKey).toBe(true);
  });

  it('generates a different key each time', () => {
    const first = resolveEncryptionSelection('local').envUpdates;
    const second = resolveEncryptionSelection('local').envUpdates;

    expect(first.ENCRYPTION_MASTER_KEY).not.toBe(second.ENCRYPTION_MASTER_KEY);
  });
});

describe('managed providers', () => {
  it('writes the KMS key id', () => {
    expect(
      resolveEncryptionSelection('kms', {
        keyId: 'arn:aws:kms:::key/x',
        apiKey: '',
      }).envUpdates,
    ).toEqual({
      ENCRYPTION_PROVIDER: 'kms',
      AWS_KMS_KEY_ID: 'arn:aws:kms:::key/x',
    });
  });

  it('writes both Scaleway credentials', () => {
    expect(
      resolveEncryptionSelection('scaleway', {
        keyId: ' kid ',
        apiKey: ' scw ',
      }).envUpdates,
    ).toEqual({
      ENCRYPTION_PROVIDER: 'scaleway',
      SCW_KEY_MANAGER_KEY_ID: 'kid',
      SCW_API_KEY: 'scw',
    });
  });

  it('never reports a generated key for a managed provider', () => {
    expect(
      resolveEncryptionSelection('kms', { keyId: 'x', apiKey: '' })
        .generatedKey,
    ).toBe(false);
  });
});
