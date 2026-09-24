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
 *
 * **Three answers, two providers.** The third answer, RustFS, is not a third
 * provider: to the apps it is plain S3 on `localhost:59000`, and the seam has
 * no variant for it and should not grow one. What makes it an answer of its
 * own is everything *around* the app config — it is a service this install
 * starts (compose's `s3` profile), and the store's keys have to be known to
 * two files that are read by two different programs: Compose reads `.env` to
 * give RustFS its keys, the apps read `.env.local` to present them. So a
 * selection carries `composeProfiles` and `composeEnv` beside `envUpdates`,
 * and `provider` stays what the config and the seam understand.
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

import { generateS3AccessKeyId, generateS3SecretAccessKey } from './secrets';

/** What the wizard offers. */
export type StorageChoice = 'local' | 's3' | 'rustfs';

/**
 * What the app sees — `STORAGE_PROVIDER` and `ragen.config.ts`'s `provider`.
 * Kept separate from `StorageChoice` so that `'rustfs'` cannot reach either:
 * the seam would refuse it at boot, and the typed config would not compile.
 */
export type StorageProvider = 'local' | 's3';

/** The compose profile RustFS and its two init containers sit behind. */
export const RUSTFS_COMPOSE_PROFILE = 's3';

/**
 * Where the apps reach RustFS. The apps run on the host (compose runs only the
 * backing services), so this is the published port, not `rustfs:9000` — that
 * name resolves only inside the compose network. The defaults mirror
 * `docker-compose.yml`, and `RUSTFS_PUBLISHED_PORTS` in `tasks.ts` is held to
 * that file by `installer-ports-agree-with-compose.test.ts`.
 */
export const RUSTFS_ENDPOINT_URL = 'http://localhost:59000';

/**
 * Where RustFS answers from *inside* the compose network — for the apps when
 * they run as containers (`npm run ragen:up:everything`), where `localhost` is
 * the container itself. `docker-compose.fullapp.yml` prefers
 * `S3_CONTAINER_ENDPOINT_URL` over `S3_ENDPOINT_URL` for exactly this.
 */
export const RUSTFS_CONTAINER_ENDPOINT_URL = 'http://rustfs:9000';

/** The web console, printed at the end so someone can look inside the store. */
export const RUSTFS_CONSOLE_URL = 'http://localhost:59001';

/** The bucket `rustfs-bucket-init` creates on every `up`. */
export const RUSTFS_BUCKET = 'ragen';

/**
 * RustFS ignores the region, but the AWS SDK refuses to sign a request without
 * one and the seam requires `S3_REGION`. `us-east-1` is what every
 * S3-compatible server answers to, and what the bucket init uses.
 */
export const RUSTFS_REGION = 'us-east-1';

/**
 * The keys RustFS is started with. Generated per install rather than using
 * compose's `ragen-local` defaults, which are printed in a public file.
 */
export interface RustfsKeys {
  accessKey: string;
  secretKey: string;
}

export function generateRustfsKeys(): RustfsKeys {
  return {
    accessKey: generateS3AccessKeyId(),
    secretKey: generateS3SecretAccessKey(),
  };
}

export interface S3Answers {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Blank selects AWS. Set for R2, Scaleway, MinIO or Ceph. */
  endpoint: string;
}

export interface StorageSelection {
  /** The answer, so later steps can tell RustFS from an S3 someone else runs. */
  choice: StorageChoice;
  provider: StorageProvider;
  /** Written to the root `.env.local` — credentials never go in the config. */
  envUpdates: Record<string, string>;
  /** The config fields, already named as the config names them. */
  configFields: ConfigField[];
  /** Passed to `docker compose --profile …`, so choosing it starts it. */
  composeProfiles: string[];
  /**
   * Lines for the install's `.env`, which Compose reads and the apps do not.
   * Written only where the file has no value yet — see `writeComposeEnv` in
   * `cli.ts` for why an existing value wins.
   */
  composeEnv: Record<string, string>;
}

export const STORAGE_LABELS: Record<StorageChoice, string> = {
  local: 'Local filesystem (default — no cloud account needed)',
  s3: 'S3-compatible (AWS, Cloudflare R2, Scaleway, MinIO, Ceph)',
  rustfs: 'RustFS — self-hosted object storage, started with the stack',
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

/**
 * `answers` is read for `s3`, `rustfsKeys` for `rustfs`. RustFS generates its
 * keys when none are given; the wizard passes them only when the install's
 * `.env` already holds keys the store was started with (see
 * `withExistingRustfsKeys`).
 */
export function resolveStorageSelection(
  choice: StorageChoice,
  answers?: S3Answers,
  rustfsKeys?: RustfsKeys,
): StorageSelection {
  if (choice === 'rustfs') {
    return rustfsSelection(rustfsKeys ?? generateRustfsKeys());
  }

  if (choice === 'local' || !answers) {
    return {
      choice: 'local',
      provider: 'local',
      envUpdates: { STORAGE_PROVIDER: 'local' },
      configFields: [
        { field: 'path', envVar: 'STORAGE_LOCAL_PATH', required: false },
      ],
      composeProfiles: [],
      composeEnv: {},
    };
  }

  return s3Selection(answers);
}

/**
 * RustFS through the S3 path, not beside it: the same five variables and the
 * same config fields an S3 answer pointed at `localhost:59000` would produce.
 * A second hand-written list is how the two would drift, and the apps cannot
 * tell them apart anyway. Path-style comes from `needsPathStyle` like it does
 * for MinIO — a `localhost` host has no bucket subdomains to resolve.
 */
function rustfsSelection(keys: RustfsKeys): StorageSelection {
  const s3 = s3Selection({
    bucket: RUSTFS_BUCKET,
    region: RUSTFS_REGION,
    endpoint: RUSTFS_ENDPOINT_URL,
    accessKeyId: keys.accessKey,
    secretAccessKey: keys.secretKey,
  });

  return {
    ...s3,
    choice: 'rustfs',
    composeProfiles: [RUSTFS_COMPOSE_PROFILE],
    // `.env` is the only file Compose reads, and it serves two readers: the
    // RustFS server (its root keys) and, with the apps in containers
    // (`ragen:up:everything`), the apps themselves — which otherwise never see
    // `.env.local` and would quietly store to the local volume instead. So the
    // S3 settings go here too, derived from the same pair of keys, with the
    // container-side endpoint. The host apps are unaffected: `.env.local`
    // holds the same values and wins over `.env`, and nothing on the host
    // reads S3_CONTAINER_ENDPOINT_URL.
    composeEnv: {
      RUSTFS_ACCESS_KEY: keys.accessKey,
      RUSTFS_SECRET_KEY: keys.secretKey,
      STORAGE_PROVIDER: 's3',
      S3_CONTAINER_ENDPOINT_URL: RUSTFS_CONTAINER_ENDPOINT_URL,
      S3_FORCE_PATH_STYLE: 'true',
      S3_REGION: RUSTFS_REGION,
      S3_BUCKET_NAME: RUSTFS_BUCKET,
      S3_ACCESS_KEY_ID: keys.accessKey,
      S3_SECRET_ACCESS_KEY: keys.secretKey,
    },
  };
}

/**
 * The same selection, with any RustFS key the install's `.env` already has
 * taking the place of the generated one.
 *
 * `.env` wins because it is what the store was *started* with: RustFS takes
 * its root keys from its environment on every boot, and rotating them in
 * `.env.local` alone would leave the apps presenting keys the running store
 * does not know. Rotating both would be worse on a store that already holds
 * files — the new keys would work, and nothing would say the old ones were
 * someone's only record. Reusing them keeps `.env` and `.env.local` agreeing,
 * which is the invariant that matters: one pair of keys, written twice.
 *
 * Per key, not all-or-nothing, because the `.env` merge is per line too: a
 * file with only one of the two keeps it and gets the other appended.
 */
export function withExistingRustfsKeys(
  selection: StorageSelection,
  existing: Record<string, string | undefined>,
): StorageSelection {
  if (selection.choice !== 'rustfs') {
    return selection;
  }

  const accessKey =
    existing.RUSTFS_ACCESS_KEY?.trim() ||
    selection.composeEnv.RUSTFS_ACCESS_KEY;
  const secretKey =
    existing.RUSTFS_SECRET_KEY?.trim() ||
    selection.composeEnv.RUSTFS_SECRET_KEY;

  return rustfsSelection({ accessKey, secretKey });
}

function s3Selection(answers: S3Answers): StorageSelection {
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

  return {
    choice: 's3',
    provider: 's3',
    envUpdates,
    configFields,
    composeProfiles: [],
    composeEnv: {},
  };
}
