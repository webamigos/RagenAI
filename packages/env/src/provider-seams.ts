/**
 * A provider seam, described once as data.
 *
 * Every provider seam in this system has the same shape: one variable picks an
 * implementation, and that choice makes a different set of variables mandatory
 * and a different set meaningful. That fact was previously written down three
 * times in three languages — as `requiredForProvider` calls in
 * `provider-rules.ts`, as prose on the documentation site, and as
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
   * Applied when the discriminant is unset, where a schema default decides it.
   * `undefined` means something else decides — see `whenUnset`.
   */
  readonly defaultVariant?: string;
  /**
   * What an unset discriminant actually does, in one sentence, when it is not
   * simply `defaultVariant`.
   *
   * Required for a seam with no default, because "unset" is never "nothing
   * happens" in that case and saying so is worse than saying nothing: both
   * seams here auto-detect from credentials, and one of them *refuses to
   * start* in production with none. A generated page said "Unset selects
   * nothing and requires nothing" about both until this field existed.
   * `provider-seams.test.ts` fails on a defaultless seam that omits it.
   */
  readonly whenUnset?: string;
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
  whenUnset:
    'Unset auto-detects from whichever credentials are present, in the order Scaleway, KMS, local (`getKeyProvider()`). A deployed environment with no provider at all refuses to start, unless `ALLOW_UNENCRYPTED=1` says so deliberately.',
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

/**
 * Post-retrieval reranking (ADR-12).
 *
 * The whole seam is inert unless `FEATURE_FLAG_RERANKING=1` — both variants
 * check it before doing anything. The flag is not part of the seam: flags
 * resolve per organization through `@ragenai/platform-contracts`, and this
 * table describes what a *deployment* must set once a provider is chosen.
 */
export const RERANK_SEAM = {
  discriminant: 'RERANK_PROVIDER',
  group: 'reranker',
  label: 'Reranker',
  defaultVariant: 'scaleway',
  variants: {
    scaleway: {
      required: ['SCW_API_BASE', 'SCW_API_KEY'],
      optional: ['RERANK_MODEL'],
      fields: {
        SCW_API_BASE: 'apiBase',
        SCW_API_KEY: 'apiKey',
        RERANK_MODEL: 'model',
      },
      summary:
        'Scaleway /v1/rerank (qwen3-embedding-8b). The default. `SCW_API_KEY` is the same account key the Scaleway encryption provider uses — one key, two features.',
    },
    cohere: {
      // Required *of this variant*, while the fragment keeps it optional: the
      // variant itself is opt-in, so a deployment on the default Scaleway
      // reranker declares none of this. There is no `rerankRules` calling
      // `requiredForProvider`, so nothing rejects a boot without it — what
      // this changes is the generated reference and the installer's typed
      // config, which said "optional" about the one variable the variant
      // cannot work without.
      required: ['RERANK_COHERE_BASE_URL'],
      optional: ['RERANK_COHERE_API_KEY', 'RERANK_MODEL'],
      fields: {
        RERANK_COHERE_BASE_URL: 'baseUrl',
        RERANK_COHERE_API_KEY: 'apiKey',
        RERANK_MODEL: 'model',
      },
      summary:
        "Cohere Rerank v3.5, over any endpoint speaking Cohere's `/rerank` shape. `RERANK_COHERE_BASE_URL` names it, and there is nothing to fall back to: the `LITELLM_PROXY_URL` default went with the proxy in B6, so selecting this variant without an endpoint reranks nothing. That failure is silent by design — an unreachable reranker degrades to no reranking rather than erroring — so set the URL deliberately and confirm reranking is happening rather than assuming it.",
    },
  },
} as const satisfies ProviderSeam;

/**
 * Outgoing mail.
 *
 * No default variant, and for a sharper reason than encryption's: the
 * discriminant is usually *unset* and `getMailProvider()` detects from
 * credentials — a `RESEND_API_KEY` selects Resend, an `SMTP_HOST` selects
 * SMTP. Naming a default here would contradict that. The variable exists to
 * override the detection, or to decide when both are configured.
 */
export const MAIL_SEAM = {
  discriminant: 'MAIL_PROVIDER',
  group: 'mail',
  label: 'Mail',
  whenUnset:
    'Unset detects from credentials: `RESEND_API_KEY` selects Resend, `SMTP_HOST` selects SMTP. With neither, outside production the message is logged instead of sent, and in production `getMailProvider()` throws rather than let an operator silently lose every invitation.',
  variants: {
    resend: {
      required: ['RESEND_API_KEY'],
      optional: ['RESEND_DEFAULT_SEGMENT_ID'],
      fields: {
        RESEND_API_KEY: 'apiKey',
        RESEND_DEFAULT_SEGMENT_ID: 'defaultSegmentId',
      },
      summary: 'Resend.',
    },
    smtp: {
      required: ['SMTP_HOST'],
      optional: ['SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'],
      fields: {
        SMTP_HOST: 'host',
        SMTP_PORT: 'port',
        SMTP_USER: 'user',
        SMTP_PASS: 'password',
        SMTP_SECURE: 'secure',
      },
      summary:
        'Any SMTP relay. Only the host is required: `SMTP_PORT` defaults to 587, and authentication is set only when `SMTP_USER` is given, because unauthenticated relays are real.',
    },
    console: {
      required: [],
      summary:
        'Log the message instead of sending it. What a laptop wants, and an explicit way to say in production that no email will be delivered — which the mailer otherwise refuses to assume.',
    },
  },
} as const satisfies ProviderSeam;

/**
 * Text-to-speech and speech-to-text.
 *
 * No default variant, and unlike mail, **unset means off** rather than
 * "detect from credentials". `getTtsProvider()` returns `null` when nothing
 * selects a provider, and a null provider is a feature that is simply absent —
 * not a degraded mode. Speech bills per request and sits outside the core loop,
 * so an `OPENAI_API_KEY` present for chat must not quietly enable it.
 * `ELEVENLABS_API_KEY` does select ElevenLabs, because that key has no other
 * use here.
 *
 * `openai` means **OpenAI's `/v1/audio/*` API**, not OpenAI the company:
 * `SPEECH_BASE_URL` points it at vLLM, a LiteLLM proxy, or any host that speaks
 * the same shape (Q6). Before B3 it read `LITELLM_PROXY_URL` and there was no
 * way to say otherwise — which was worse than a missing option, because the
 * shipped proxy config registers no audio route, so choosing `openai` in any
 * deployment that had a proxy URL produced a 404 per request.
 */
export const SPEECH_SEAM = {
  discriminant: 'SPEECH_PROVIDER',
  group: 'speech',
  label: 'Speech',
  whenUnset:
    'Unset leaves speech off, unless `ELEVENLABS_API_KEY` is set, which selects ElevenLabs. Deliberately not detected from `OPENAI_API_KEY`: that key is there for chat, and speech bills per request.',
  variants: {
    elevenlabs: {
      required: ['ELEVENLABS_API_KEY'],
      fields: { ELEVENLABS_API_KEY: 'apiKey' },
      summary: 'ElevenLabs, for both synthesis and transcription.',
    },
    openai: {
      required: [],
      optional: ['SPEECH_BASE_URL', 'SPEECH_API_KEY', 'TTS_MODEL', 'STT_MODEL'],
      fields: {
        SPEECH_BASE_URL: 'baseUrl',
        SPEECH_API_KEY: 'apiKey',
        TTS_MODEL: 'ttsModel',
        STT_MODEL: 'sttModel',
      },
      summary:
        "OpenAI's `/v1/audio/*` API. Nothing is required here because `SPEECH_API_KEY` falls back to `OPENAI_API_KEY`, which a deployment reaching OpenAI already has; `SPEECH_BASE_URL` defaults to OpenAI itself and is how you point at vLLM or a proxy instead.",
    },
  },
} as const satisfies ProviderSeam;

/**
 * Which engine runs background jobs (the worker-runtime spec, §9).
 *
 * The first seam here whose *default* variant requires anything, which is why
 * `seamRule` had to learn about `defaultVariant` — see `provider-rules.ts`.
 * Storage's default requires nothing and the reranker's default has no rule at
 * all, so an unset discriminant had never yet needed to mean something.
 *
 * The point of the seam is that neither variable is required in general.
 * Before it, the worker demanded the Temporal variables unconditionally, which
 * is right only while Temporal is the only runtime: after the switch it would
 * refuse to start a deployment that runs no Temporal at all. And `REDIS_URL`
 * cannot simply become mandatory everywhere either — apps/web runs without it
 * today, with the settings cache computing directly and the chatbot rate
 * limiter failing open.
 *
 * `TEMPORAL_CERT` and `TEMPORAL_KEY` are carried because `.env.example` ships
 * them, but nothing reads either yet; see `fragments.temporal`.
 */
export const WORKER_RUNTIME_SEAM = {
  discriminant: 'WORKER_RUNTIME',
  group: 'workerRuntime',
  label: 'Worker runtime',
  defaultVariant: 'bullmq',
  variants: {
    temporal: {
      required: ['TEMPORAL_SERVER_ADDRESS'],
      optional: ['TEMPORAL_NAMESPACE', 'TEMPORAL_CERT', 'TEMPORAL_KEY'],
      fields: {
        TEMPORAL_SERVER_ADDRESS: 'address',
        TEMPORAL_NAMESPACE: 'namespace',
        TEMPORAL_CERT: 'cert',
        TEMPORAL_KEY: 'key',
      },
      summary:
        'Temporal, no longer the default and no longer in the compose file ([ADR-44](../../../docs/adrs/44-bullmq-is-the-worker-runtime.md)) — an install that wants durable execution runs its own server and selects it here. `TEMPORAL_SERVER_ADDRESS` is required rather than left to the `localhost:7233` fallback, because that fallback is right on a laptop and silent everywhere else: a deployed process pointing at its own container connects to nothing and processes nothing, with no error to read.',
    },
    bullmq: {
      required: ['REDIS_URL'],
      optional: [
        'WORKER_CONCURRENCY',
        'WORKER_ADMIN_PORT',
        'WORKER_ADMIN_USER',
        'WORKER_ADMIN_PASSWORD',
      ],
      fields: {
        REDIS_URL: 'url',
        WORKER_CONCURRENCY: 'concurrency',
        WORKER_ADMIN_PORT: 'adminPort',
        WORKER_ADMIN_USER: 'adminUser',
        WORKER_ADMIN_PASSWORD: 'adminPassword',
      },
      summary:
        'BullMQ over Redis, the default ([ADR-44](../../../docs/adrs/44-bullmq-is-the-worker-runtime.md)). `REDIS_URL` has no fallback anywhere — a queue with no Redis is a worker that starts and quietly processes nothing, which is the worse outcome. The Redis it points at must run `maxmemory-policy noeviction`: an evicting instance drops queue keys, and the jobs go with them. The queue dashboard replaces the Temporal UI an install used to get on port 8080; it is off unless `WORKER_ADMIN_USER` and `WORKER_ADMIN_PASSWORD` are both set, because it shows every job payload and a dashboard that appears by default on an unauthenticated port is a finding rather than a feature.',
    },
  },
} as const satisfies ProviderSeam;

/** Every seam, for a consumer that renders or checks all of them. */
export const PROVIDER_SEAMS = [
  STORAGE_SEAM,
  ENCRYPTION_SEAM,
  RERANK_SEAM,
  MAIL_SEAM,
  SPEECH_SEAM,
  WORKER_RUNTIME_SEAM,
] as const;

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
