/**
 * A provider seam, described once as data.
 *
 * Every provider seam in this system has the same shape: one variable picks an
 * implementation, and that choice makes a different set of variables mandatory
 * and a different set meaningful. That fact was previously written down three
 * times in three languages — as `requiredForProvider` calls in
 * `provider-rules.ts`, as prose in `apps/docs/docs/configuration.md`, and as
 * whatever the person editing `.env` happened to remember. The copies drifted,
 * which is not a hypothesis: the review of #1114 found the documentation
 * listing `S3_ENDPOINT_URL` as required when it is optional, and omitting
 * `S3_SESSION_TOKEN` entirely.
 *
 * So the seam is data, and the things that need it derive from it:
 *
 * - `provider-rules.ts` generates the boot-time check;
 * - a generated configuration reference can render the table instead of
 *   restating it;
 * - the installer's typed config can make "chose s3, forgot the bucket"
 *   a type error rather than a runtime one (ADR-37's second revisit
 *   trigger — self-hosting becoming a product, with the setup surface
 *   writing a configuration file).
 *
 * What a seam deliberately does *not* carry: whether a variable is a secret,
 * and what its value should be. Those belong to the deployment, which is what
 * environment variables are for (ADR-37).
 */

/** One implementation behind a seam, and what choosing it means. */
export type SeamVariant = {
  /**
   * Mandatory once this variant is chosen. Checked as *present and non-blank*,
   * not as usable — validating a value's content needs the package that owns
   * it, and those depend on this one.
   */
  readonly required: readonly string[];
  /**
   * Meaningful for this variant but safe to omit, because something downstream
   * has a real default. Carried so a generated reference cannot promote one of
   * these to "required", which is the mistake #1114 made with
   * `S3_ENDPOINT_URL`.
   */
  readonly optional?: readonly string[];
  /** One line, for an error message or a generated table. */
  readonly summary: string;
  /**
   * Environment variable name to the field that carries it in a written
   * configuration — `S3_BUCKET_NAME` to `bucketName`.
   *
   * The mapping lives here rather than in the config types because otherwise
   * it is the fourth place the same seam is described, and the one nothing
   * checks. Every variable in `required` and `optional` must appear as a key;
   * `provider-seams.test.ts` fails when one does not.
   */
  readonly fields?: Readonly<Record<string, string>>;
};

export type ProviderSeam = {
  /** The variable that picks the implementation. */
  readonly discriminant: string;
  /** The key this seam occupies in a written configuration. */
  readonly group: string;
  /** What the seam is called in a message addressed to an operator. */
  readonly label: string;
  /**
   * Applied when the discriminant is unset. `undefined` means unset selects
   * nothing and requires nothing, which is not the same as a variant named
   * "none".
   */
  readonly defaultVariant?: string;
  readonly variants: Readonly<Record<string, SeamVariant>>;
};

/**
 * ADR-27: local is the default, because self-hosted software has to run from a
 * fresh clone without a cloud account.
 */
export const STORAGE_SEAM = {
  discriminant: 'STORAGE_PROVIDER',
  group: 'storage',
  label: 'Storage',
  defaultVariant: 'local',
  variants: {
    local: {
      required: [],
      optional: ['STORAGE_LOCAL_PATH'],
      fields: { STORAGE_LOCAL_PATH: 'path' },
      summary:
        'Files on the container filesystem. `STORAGE_LOCAL_PATH` defaults to ./data/storage, so nothing is mandatory — but every process that touches files needs the same volume.',
    },
    s3: {
      required: [
        'S3_BUCKET_NAME',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ],
      optional: ['S3_ENDPOINT_URL', 'S3_SESSION_TOKEN', 'S3_FORCE_PATH_STYLE'],
      fields: {
        S3_BUCKET_NAME: 'bucketName',
        S3_REGION: 'region',
        S3_ACCESS_KEY_ID: 'accessKeyId',
        S3_SECRET_ACCESS_KEY: 'secretAccessKey',
        S3_ENDPOINT_URL: 'endpoint',
        S3_SESSION_TOKEN: 'sessionToken',
        S3_FORCE_PATH_STYLE: 'forcePathStyle',
      },
      summary:
        'Any S3-compatible store. `S3_ENDPOINT_URL` is optional — unset selects the default AWS endpoint, and it is set to point at R2, Scaleway, MinIO or Ceph. `S3_SESSION_TOKEN` is for temporary credentials; `S3_FORCE_PATH_STYLE` for stores that need path-style addressing.',
    },
  },
} as const satisfies ProviderSeam;

/**
 * No default: unset means the auto-detection in `@ragenai/crypto` picks from
 * whichever credentials are present, so naming a variant here would contradict
 * it. A deployed environment with no provider at all is refused separately, by
 * `getEncryptionStartupStatus()`.
 */
export const ENCRYPTION_SEAM = {
  discriminant: 'ENCRYPTION_PROVIDER',
  group: 'encryption',
  label: 'Encryption',
  variants: {
    scaleway: {
      required: ['SCW_KEY_MANAGER_KEY_ID', 'SCW_API_KEY'],
      optional: ['SCW_KEY_MANAGER_REGION'],
      fields: {
        SCW_KEY_MANAGER_KEY_ID: 'keyId',
        SCW_API_KEY: 'apiKey',
        SCW_KEY_MANAGER_REGION: 'region',
      },
      summary: 'Scaleway Key Manager (ADR-02).',
    },
    kms: {
      required: ['AWS_KMS_KEY_ID'],
      optional: ['AWS_DEFAULT_REGION', 'AWS_ENDPOINT_URL'],
      fields: {
        AWS_KMS_KEY_ID: 'keyId',
        AWS_DEFAULT_REGION: 'region',
        AWS_ENDPOINT_URL: 'endpoint',
      },
      summary: 'AWS KMS.',
    },
    local: {
      required: ['ENCRYPTION_MASTER_KEY'],
      fields: { ENCRYPTION_MASTER_KEY: 'masterKey' },
      summary:
        'A key in the environment. Present is not the same as usable: the value is parsed by @ragenai/crypto, not here.',
    },
  },
} as const satisfies ProviderSeam;

/** Every seam, for a consumer that renders or checks all of them. */
export const PROVIDER_SEAMS = [STORAGE_SEAM, ENCRYPTION_SEAM] as const;

/** The variant names of a seam — `'local' | 's3'` for storage. */
export type VariantOf<S extends ProviderSeam> = keyof S['variants'] & string;

/**
 * The variables a chosen variant makes mandatory, as a union of literals.
 *
 * This is what lets a typed config object require the four S3 variables the
 * moment `'s3'` is chosen, from the same table the boot-time check reads.
 */
export type RequiredVarsOf<
  S extends ProviderSeam,
  V extends VariantOf<S>,
> = S['variants'][V] extends { readonly required: readonly (infer N)[] }
  ? N
  : never;
