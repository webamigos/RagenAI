/**
 * Where uploaded documents live.
 *
 * The wizard skipped this until now and sent people to a manual guide, which
 * is the one question where getting it wrong is expensive: `STORAGE_PROVIDER=s3`
 * with a missing credential does not fail at boot in every app, it fails at
 * the first upload, as a storage error three layers from the cause.
 *
 * The variable names and the config field names below mirror `STORAGE_SEAM` in
 * `@ragenai/env`. They are copied rather than imported because this package is
 * published to npm and `@ragenai/env` is private, so a dependency on it would
 * make `npm create ragen-app` unresolvable. The copy is held to the original
 * by `tests/architecture/create-ragen-app-knows-the-provider-seams.test.ts` —
 * the same arrangement `manifest.ts` already has with the `.env.example`
 * files.
 */

/**
 * One field of a written config, and the variable it resolves from.
 *
 * `required` decides how the installer renders it: a required field is typed
 * `string`, so it needs a fallback to compile, while an optional one takes
 * `process.env.X` as it comes. Carrying it here rather than inferring from the
 * name keeps the renderer from having a fourth opinion about which variables a
 * provider needs.
 */
export interface ConfigField {
  field: string;
  envVar: string;
  required: boolean;
}

export type StorageChoice = 'local' | 's3';

export interface S3Answers {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Blank selects AWS. Set for R2, Scaleway, MinIO or Ceph. */
  endpoint: string;
}

export interface StorageSelection {
  provider: StorageChoice;
  /** Written to the root `.env.local` — credentials never go in the config. */
  envUpdates: Record<string, string>;
  /** The config fields, already named as the config names them. */
  configFields: ConfigField[];
}

export const STORAGE_LABELS: Record<StorageChoice, string> = {
  local: 'Local filesystem (default — no cloud account needed)',
  s3: 'S3-compatible (AWS, Cloudflare R2, Scaleway, MinIO, Ceph)',
};

/**
 * A path-style endpoint is what Scaleway (dotted bucket names) and MinIO/Ceph
 * need. Guessing it from the endpoint rather than asking keeps the wizard to
 * one question per thing a person actually knows about their own storage.
 */
function needsPathStyle(endpoint: string): boolean {
  const host = endpoint.trim().toLowerCase();
  if (!host) {
    return false;
  }
  return (
    !host.includes('amazonaws.com') &&
    !host.includes('r2.cloudflarestorage.com')
  );
}

export function resolveStorageSelection(
  provider: StorageChoice,
  answers?: S3Answers,
): StorageSelection {
  if (provider === 'local' || !answers) {
    return {
      provider: 'local',
      envUpdates: { STORAGE_PROVIDER: 'local' },
      configFields: [
        { field: 'path', envVar: 'STORAGE_LOCAL_PATH', required: false },
      ],
    };
  }

  const endpoint = answers.endpoint.trim();

  const envUpdates: Record<string, string> = {
    STORAGE_PROVIDER: 's3',
    S3_BUCKET_NAME: answers.bucket.trim(),
    S3_REGION: answers.region.trim(),
    S3_ACCESS_KEY_ID: answers.accessKeyId.trim(),
    S3_SECRET_ACCESS_KEY: answers.secretAccessKey.trim(),
  };

  const configFields: ConfigField[] = [
    { field: 'bucketName', envVar: 'S3_BUCKET_NAME', required: true },
    { field: 'region', envVar: 'S3_REGION', required: true },
    { field: 'accessKeyId', envVar: 'S3_ACCESS_KEY_ID', required: true },
    {
      field: 'secretAccessKey',
      envVar: 'S3_SECRET_ACCESS_KEY',
      required: true,
    },
  ];

  if (endpoint) {
    envUpdates.S3_ENDPOINT_URL = endpoint;
    configFields.push({
      field: 'endpoint',
      envVar: 'S3_ENDPOINT_URL',
      required: false,
    });

    if (needsPathStyle(endpoint)) {
      envUpdates.S3_FORCE_PATH_STYLE = 'true';
      configFields.push({
        field: 'forcePathStyle',
        envVar: 'S3_FORCE_PATH_STYLE',
        required: false,
      });
    }
  }

  return { provider: 's3', envUpdates, configFields };
}
