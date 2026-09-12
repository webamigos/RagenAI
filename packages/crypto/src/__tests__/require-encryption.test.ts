import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetKeyProviderForTests } from '../key-provider';
import {
  assertEncryptionAvailable,
  EncryptionRequiredError,
  getEncryptionStartupStatus,
  isEncryptionRequired,
  isEncryptionRequirementBypassed,
} from '../require-encryption';

const HEX_KEY = Buffer.alloc(32, 3).toString('hex');

const ENV_KEYS = [
  'NODE_ENV',
  'TARGET_ENV',
  'ALLOW_UNENCRYPTED',
  'ENCRYPTION_PROVIDER',
  'ENCRYPTION_MASTER_KEY',
  'SCW_KEY_MANAGER_KEY_ID',
  'SCW_API_KEY',
  'AWS_KMS_KEY_ID',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
  resetKeyProviderForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
  resetKeyProviderForTests();
});

function configureLocalProvider(): void {
  process.env.ENCRYPTION_PROVIDER = 'local';
  process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;
}

describe('isEncryptionRequired', () => {
  it('is false under a development or test NODE_ENV, regardless of TARGET_ENV', () => {
    process.env.NODE_ENV = 'development';
    process.env.TARGET_ENV = 'production';
    expect(isEncryptionRequired()).toBe(false);

    process.env.NODE_ENV = 'test';
    expect(isEncryptionRequired()).toBe(false);
  });

  it.each(['local', 'test', 'e2e', 'ci'])(
    'is false for TARGET_ENV=%s outside dev/test NODE_ENV',
    (targetEnv) => {
      process.env.NODE_ENV = 'production';
      process.env.TARGET_ENV = targetEnv;
      expect(isEncryptionRequired()).toBe(false);
    },
  );

  it.each(['staging', 'production', 'demo'])(
    'is true for a real deployment TARGET_ENV=%s',
    (targetEnv) => {
      process.env.NODE_ENV = 'production';
      process.env.TARGET_ENV = targetEnv;
      expect(isEncryptionRequired()).toBe(true);
    },
  );

  it('reads an unset TARGET_ENV as a deployment rather than an excuse', () => {
    process.env.NODE_ENV = 'production';
    expect(isEncryptionRequired()).toBe(true);
  });

  it('reads a blank TARGET_ENV the same as unset', () => {
    process.env.NODE_ENV = 'production';
    process.env.TARGET_ENV = '   ';
    expect(isEncryptionRequired()).toBe(true);
  });
});

describe('isEncryptionRequirementBypassed', () => {
  it('is true only for the literal opt-in value', () => {
    expect(isEncryptionRequirementBypassed()).toBe(false);

    process.env.ALLOW_UNENCRYPTED = 'true';
    expect(isEncryptionRequirementBypassed()).toBe(false);

    process.env.ALLOW_UNENCRYPTED = '1';
    expect(isEncryptionRequirementBypassed()).toBe(true);
  });
});

describe('getEncryptionStartupStatus', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.TARGET_ENV = 'production';
  });

  it('is ok when a provider is configured, even if required', () => {
    configureLocalProvider();
    expect(getEncryptionStartupStatus()).toBe('ok');
  });

  it('is ok when not required, even with nothing configured', () => {
    process.env.NODE_ENV = 'test';
    expect(getEncryptionStartupStatus()).toBe('ok');
  });

  it('is blocked when required, unconfigured, and not bypassed', () => {
    expect(getEncryptionStartupStatus()).toBe('blocked');
  });

  it('is bypassed when required, unconfigured, and ALLOW_UNENCRYPTED=1', () => {
    process.env.ALLOW_UNENCRYPTED = '1';
    expect(getEncryptionStartupStatus()).toBe('bypassed');
  });
});

describe('assertEncryptionAvailable', () => {
  it('throws EncryptionRequiredError only when blocked', () => {
    process.env.NODE_ENV = 'production';
    process.env.TARGET_ENV = 'production';

    expect(() => assertEncryptionAvailable()).toThrow(EncryptionRequiredError);

    process.env.ALLOW_UNENCRYPTED = '1';
    expect(() => assertEncryptionAvailable()).not.toThrow();
  });

  it('does not throw locally', () => {
    process.env.NODE_ENV = 'test';
    expect(() => assertEncryptionAvailable()).not.toThrow();
  });
});
