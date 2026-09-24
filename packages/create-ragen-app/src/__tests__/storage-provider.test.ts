import { describe, expect, it } from 'vitest';

import {
  resolveStorageSelection,
  RUSTFS_BUCKET,
  RUSTFS_COMPOSE_PROFILE,
  RUSTFS_ENDPOINT_URL,
  RUSTFS_REGION,
  withExistingRustfsKeys,
} from '../storage-provider';

const ANSWERS = {
  bucket: 'ragen-docs',
  region: 'fr-par',
  endpoint: '',
  accessKeyId: 'SCWXXXXXXXX',
  secretAccessKey: 'secret',
};

describe('local storage', () => {
  it('asks for nothing beyond the provider', () => {
    expect(resolveStorageSelection('local').envUpdates).toEqual({
      STORAGE_PROVIDER: 'local',
    });
  });

  it('falls back to local when the answers are missing', () => {
    // The wizard drops here when someone declines the secret key rather than
    // writing a half-configured s3, which fails at the first upload.
    expect(resolveStorageSelection('s3').provider).toBe('local');
  });
});

describe('s3 storage', () => {
  it('writes the four credentials the seam requires', () => {
    expect(resolveStorageSelection('s3', ANSWERS).envUpdates).toEqual({
      STORAGE_PROVIDER: 's3',
      S3_BUCKET_NAME: 'ragen-docs',
      S3_REGION: 'fr-par',
      S3_ACCESS_KEY_ID: 'SCWXXXXXXXX',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
  });

  it('trims what was pasted', () => {
    // A trailing space copied out of a cloud console is silent and fatal.
    const { envUpdates } = resolveStorageSelection('s3', {
      ...ANSWERS,
      bucket: '  ragen-docs  ',
    });

    expect(envUpdates.S3_BUCKET_NAME).toBe('ragen-docs');
  });

  it('omits the endpoint for AWS', () => {
    const { envUpdates } = resolveStorageSelection('s3', ANSWERS);

    expect(envUpdates).not.toHaveProperty('S3_ENDPOINT_URL');
    expect(envUpdates).not.toHaveProperty('S3_FORCE_PATH_STYLE');
  });

  it.each([
    ['https://s3.fr-par.scw.cloud', 'Scaleway'],
    ['http://localhost:9000', 'MinIO'],
  ])('forces path-style addressing for %s (%s)', (endpoint) => {
    // Dotted bucket names on Scaleway, and MinIO/Ceph generally, need it —
    // without it every request 404s against a host that does not resolve.
    const { envUpdates } = resolveStorageSelection('s3', {
      ...ANSWERS,
      endpoint,
    });

    expect(envUpdates.S3_ENDPOINT_URL).toBe(endpoint);
    expect(envUpdates.S3_FORCE_PATH_STYLE).toBe('true');
  });

  it.each([
    ['https://s3.us-east-1.amazonaws.com'],
    ['https://abc123.r2.cloudflarestorage.com'],
  ])('leaves virtual-hosted addressing alone for %s', (endpoint) => {
    const { envUpdates } = resolveStorageSelection('s3', {
      ...ANSWERS,
      endpoint,
    });

    expect(envUpdates.S3_ENDPOINT_URL).toBe(endpoint);
    expect(envUpdates).not.toHaveProperty('S3_FORCE_PATH_STYLE');
  });

  it('names the config fields the config uses', () => {
    const fields = resolveStorageSelection('s3', ANSWERS).configFields;

    expect(fields.map((f) => f.field)).toEqual([
      'bucketName',
      'region',
      'accessKeyId',
      'secretAccessKey',
    ]);
    expect(fields.every((f) => f.required)).toBe(true);
  });
});

describe('neither local nor s3 starts anything', () => {
  it.each([
    ['local', resolveStorageSelection('local')],
    ['s3', resolveStorageSelection('s3', ANSWERS)],
  ])(
    '%s asks compose for no profile and writes no .env line',
    (_, selection) => {
      // An S3 someone else runs is not a service this stack starts, and a
      // profile here would start RustFS beside a bucket that lives elsewhere.
      expect(selection.composeProfiles).toEqual([]);
      expect(selection.composeEnv).toEqual({});
    },
  );
});

describe('rustfs storage', () => {
  const KEYS = { accessKey: 'AKIDFROMTEST', secretKey: 'secret-from-test' };

  it('is s3 to the apps, pointed at the store compose starts', () => {
    const selection = resolveStorageSelection('rustfs', undefined, KEYS);

    expect(selection.choice).toBe('rustfs');
    // Not 'rustfs': the seam has no such variant and would refuse it at boot.
    expect(selection.provider).toBe('s3');
    expect(selection.envUpdates).toEqual({
      STORAGE_PROVIDER: 's3',
      S3_BUCKET_NAME: RUSTFS_BUCKET,
      S3_REGION: RUSTFS_REGION,
      S3_ACCESS_KEY_ID: 'AKIDFROMTEST',
      S3_SECRET_ACCESS_KEY: 'secret-from-test',
      S3_ENDPOINT_URL: RUSTFS_ENDPOINT_URL,
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(RUSTFS_ENDPOINT_URL).toBe('http://localhost:59000');
  });

  it('writes the same pair of keys for compose as for the apps', () => {
    // Two files, two readers, one pair: RustFS takes its keys from `.env`,
    // the apps present theirs from `.env.local`, and any difference is a 403
    // on the first upload.
    const selection = resolveStorageSelection('rustfs', undefined, KEYS);

    expect(selection.composeEnv).toMatchObject({
      RUSTFS_ACCESS_KEY: selection.envUpdates.S3_ACCESS_KEY_ID,
      RUSTFS_SECRET_KEY: selection.envUpdates.S3_SECRET_ACCESS_KEY,
    });
  });

  it('gives compose the whole S3 config, so apps in containers use RustFS too', () => {
    // `ragen:up:everything` reads only `.env`. Without these the containers
    // would store to the local volume while the host apps used RustFS; with
    // the host endpoint they would fail, `localhost` being the container.
    const selection = resolveStorageSelection('rustfs', undefined, KEYS);

    expect(selection.composeEnv).toEqual({
      RUSTFS_ACCESS_KEY: KEYS.accessKey,
      RUSTFS_SECRET_KEY: KEYS.secretKey,
      STORAGE_PROVIDER: 's3',
      S3_CONTAINER_ENDPOINT_URL: 'http://rustfs:9000',
      S3_FORCE_PATH_STYLE: 'true',
      S3_REGION: RUSTFS_REGION,
      S3_BUCKET_NAME: RUSTFS_BUCKET,
      S3_ACCESS_KEY_ID: KEYS.accessKey,
      S3_SECRET_ACCESS_KEY: KEYS.secretKey,
    });
    // The host endpoint stays in `.env.local` only.
    expect(selection.composeEnv).not.toHaveProperty('S3_ENDPOINT_URL');
  });

  it('asks compose for the s3 profile, so choosing it starts it', () => {
    expect(resolveStorageSelection('rustfs').composeProfiles).toEqual([
      RUSTFS_COMPOSE_PROFILE,
    ]);
    expect(RUSTFS_COMPOSE_PROFILE).toBe('s3');
  });

  it('produces the config fields an s3 answer on the same endpoint would', () => {
    // One shape, not two hand-written lists that could drift.
    const rustfs = resolveStorageSelection('rustfs', undefined, KEYS);
    const s3 = resolveStorageSelection('s3', {
      bucket: RUSTFS_BUCKET,
      region: RUSTFS_REGION,
      endpoint: RUSTFS_ENDPOINT_URL,
      accessKeyId: KEYS.accessKey,
      secretAccessKey: KEYS.secretKey,
    });

    expect(rustfs.configFields).toEqual(s3.configFields);
    expect(rustfs.configFields.map((f) => f.field)).toEqual([
      'bucketName',
      'region',
      'accessKeyId',
      'secretAccessKey',
      'endpoint',
      'forcePathStyle',
    ]);
  });

  it('generates keys a MinIO-compatible server accepts, fresh per install', () => {
    // An access key id of 3–20 characters and a secret of 8–40: MinIO's
    // bounds, which RustFS follows. A store that refuses its root key does not
    // start at all.
    const first = resolveStorageSelection('rustfs').composeEnv;
    const second = resolveStorageSelection('rustfs').composeEnv;

    expect(first.RUSTFS_ACCESS_KEY).toMatch(/^[0-9A-F]{20}$/);
    expect(first.RUSTFS_SECRET_KEY).toMatch(/^[0-9a-f]{40}$/);
    expect(second.RUSTFS_ACCESS_KEY).not.toBe(first.RUSTFS_ACCESS_KEY);
    expect(second.RUSTFS_SECRET_KEY).not.toBe(first.RUSTFS_SECRET_KEY);
  });
});

describe('withExistingRustfsKeys', () => {
  const generated = resolveStorageSelection('rustfs', undefined, {
    accessKey: 'GENERATED',
    secretKey: 'generated-secret',
  });

  it('reuses the keys the store was started with, in both files', () => {
    // Rerunning the wizard must not rotate the keys of a store that holds
    // files, and `.env.local` must present what `.env` started it with.
    const reused = withExistingRustfsKeys(generated, {
      RUSTFS_ACCESS_KEY: 'EXISTING',
      RUSTFS_SECRET_KEY: 'existing-secret',
    });

    expect(reused.composeEnv).toMatchObject({
      RUSTFS_ACCESS_KEY: 'EXISTING',
      RUSTFS_SECRET_KEY: 'existing-secret',
      S3_ACCESS_KEY_ID: 'EXISTING',
      S3_SECRET_ACCESS_KEY: 'existing-secret',
    });
    expect(reused.envUpdates.S3_ACCESS_KEY_ID).toBe('EXISTING');
    expect(reused.envUpdates.S3_SECRET_ACCESS_KEY).toBe('existing-secret');
  });

  it('keeps whichever key exists and generates only the other', () => {
    // Per key, matching the `.env` merge, which appends only missing lines.
    const reused = withExistingRustfsKeys(generated, {
      RUSTFS_ACCESS_KEY: 'EXISTING',
      RUSTFS_SECRET_KEY: '  ',
    });

    expect(reused.envUpdates.S3_ACCESS_KEY_ID).toBe('EXISTING');
    expect(reused.envUpdates.S3_SECRET_ACCESS_KEY).toBe('generated-secret');
  });

  it('changes nothing without a .env, or for another answer', () => {
    expect(withExistingRustfsKeys(generated, {})).toEqual(generated);

    const local = resolveStorageSelection('local');
    expect(
      withExistingRustfsKeys(local, { RUSTFS_ACCESS_KEY: 'EXISTING' }),
    ).toBe(local);
  });
});
