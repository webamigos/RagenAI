import { describe, expect, it } from 'vitest';

import { resolveStorageSelection } from '../storage-provider';

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
