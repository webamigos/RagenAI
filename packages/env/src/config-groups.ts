/**
 * The groups of a written configuration that are *not* provider seams.
 *
 * A seam has a discriminant: choosing `s3` changes what else is mandatory.
 * Most of the configuration has no such branch — a database URL is a database
 * URL — so those groups are flat, and the value of describing them here is not
 * conditional typing but the other three things the seam table gives:
 *
 * - the installer can write them from one description;
 * - a generated reference can render them instead of restating them;
 * - the config field names live beside the variables they resolve from,
 *   rather than being invented separately in each place.
 *
 * Each group is built over a fragment that already exists in `fragments.ts`,
 * so this adds naming and grouping, not a second declaration of what is valid.
 *
 * ## What is deliberately absent
 *
 * **Feature flags.** `@ragenai/platform-contracts` resolves a flag from four
 * layers — a per-organization override, the subscription plan, the platform
 * default the admin panel edits, and the code default. A file in the
 * repository is strictly worse than that and cannot be per-tenant, which is
 * ADR-37's own reasoning for keeping them out.
 *
 * **Per-organization settings.** `OrganizationSettings` carries 40 columns,
 * editable at runtime, per tenant. Not configuration in this sense.
 *
 * **App-local variables.** `CORS_ORIGIN`, `ADMIN_ALLOWED_EMAIL_DOMAIN` and
 * their like are read by one app and belong in that app's schema.
 */

export type FieldGroup = {
  /** The key this group occupies in a written configuration. */
  readonly group: string;
  readonly label: string;
  /** Mandatory for a working deployment. */
  readonly required: readonly string[];
  /** Meaningful, but something downstream has a real default. */
  readonly optional?: readonly string[];
  /** Environment variable to the field that carries it. */
  readonly fields: Readonly<Record<string, string>>;
  /**
   * Variables that only mean anything together — a vault URL and the secret
   * its client signs with. Half-configured is worse than absent, because
   * absent has a documented fallback and half produces 401s from the vault
   * rather than a legible configuration error.
   *
   * Data rather than an `allOrNone` call in each app, because it was three
   * apps' worth of calls and the group's own summary already claimed the rule
   * without anything enforcing it.
   */
  readonly pairs?: readonly {
    readonly vars: readonly [string, string];
    readonly label: string;
  }[];
  readonly summary: string;
};

export const DATABASE_GROUP = {
  group: 'database',
  label: 'Database',
  required: ['DATABASE_URL'],
  optional: ['DATABASE_DIRECT_URL'],
  fields: { DATABASE_URL: 'url', DATABASE_DIRECT_URL: 'directUrl' },
  summary:
    'Postgres. `directUrl` bypasses a connection pooler for migrations; without it the pooled URL is used for both.',
} as const satisfies FieldGroup;

export const GATEWAY_GROUP = {
  group: 'gateway',
  label: 'Model gateway',
  required: ['LITELLM_PROXY_URL'],
  optional: ['LITELLM_MASTER_KEY'],
  fields: { LITELLM_PROXY_URL: 'url', LITELLM_MASTER_KEY: 'masterKey' },
  summary:
    'Every model call goes through LiteLLM (ADR-04), so an unset URL is not a degraded mode — it is no LLM at all. The key is optional locally and required on a deployment.',
} as const satisfies FieldGroup;

export const VECTOR_STORE_GROUP = {
  group: 'vectorStore',
  label: 'Vector store',
  required: [],
  optional: ['QDRANT_URL', 'QDRANT_API_KEY'],
  fields: { QDRANT_URL: 'url', QDRANT_API_KEY: 'apiKey' },
  summary:
    'Qdrant, the only supported vector store (ADR-31). The URL falls back to http://localhost:6333 in code, which is why it is optional here and required outright in a deployed apps/worker — a silent fallback there once wrote every vector into a container-local Qdrant and reported success.',
} as const satisfies FieldGroup;

export const MODELS_GROUP = {
  group: 'models',
  label: 'Models',
  required: [],
  optional: [
    'DEFAULT_MODEL',
    'DEFAULT_MODEL_PROVIDER',
    'REPHRASE_MODEL',
    'REPHRASE_TEMPERATURE',
    'SUMMARY_MODEL',
    'EMBEDDINGS_MODEL',
    'VECTOR_SIZE',
  ],
  fields: {
    DEFAULT_MODEL: 'chat',
    DEFAULT_MODEL_PROVIDER: 'chatProvider',
    REPHRASE_MODEL: 'rephrase',
    REPHRASE_TEMPERATURE: 'rephraseTemperature',
    SUMMARY_MODEL: 'summary',
    EMBEDDINGS_MODEL: 'embeddings',
    VECTOR_SIZE: 'vectorSize',
  },
  summary:
    'Defaults for each job. All optional: each has a fallback in code, and apps/worker requires `embeddings` and `vectorSize` outright because its ingest cannot guess either. Changing `embeddings` or `vectorSize` after documents exist invalidates the collection.',
} as const satisfies FieldGroup;

export const TEMPORAL_GROUP = {
  group: 'temporal',
  label: 'Temporal',
  required: [],
  optional: ['TEMPORAL_SERVER_ADDRESS', 'TEMPORAL_NAMESPACE'],
  fields: {
    TEMPORAL_SERVER_ADDRESS: 'address',
    TEMPORAL_NAMESPACE: 'namespace',
  },
  summary:
    'Document ingest runs as Temporal workflows (ADR-26). Optional here because apps/web and apps/api fall back to localhost:7233, and required outright in apps/worker, which is the process that runs them. `TEMPORAL_CERT` and `TEMPORAL_KEY` are deliberately absent: they are declared in the schema but nothing reads them yet.',
} as const satisfies FieldGroup;

export const REDIS_GROUP = {
  group: 'redis',
  label: 'Redis',
  required: [],
  optional: ['REDIS_URL'],
  fields: { REDIS_URL: 'url' },
  summary:
    'Required by apps/worker, which caches organization settings through it. Genuinely optional in apps/web, where the absence is a real mode rather than a degraded one — the settings cache computes values directly, and the public chatbot rate limiter fails open, so rate limiting is off rather than enforced with a fallback limit.',
} as const satisfies FieldGroup;

export const OBSERVABILITY_GROUP = {
  group: 'observability',
  label: 'Observability',
  required: [],
  optional: ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_SERVICE_NAME'],
  fields: {
    OTEL_EXPORTER_OTLP_ENDPOINT: 'endpoint',
    OTEL_SERVICE_NAME: 'serviceName',
  },
  summary:
    'OpenTelemetry (ADR-22). A no-op in apps/web without an endpoint; apps/worker also traces on a Langfuse key alone.',
} as const satisfies FieldGroup;

export const TOKEN_VAULT_GROUP = {
  group: 'tokenVault',
  label: 'Token vault',
  required: [],
  optional: [
    'RAGEN_TOKEN_VAULT_URL',
    'RAGEN_TOKEN_VAULT_SERVICE_SECRET',
    'RAGEN_VAULT_URL',
    'RAGEN_VAULT_SERVICE_SECRET',
  ],
  fields: {
    RAGEN_TOKEN_VAULT_URL: 'connectorUrl',
    RAGEN_TOKEN_VAULT_SERVICE_SECRET: 'connectorSecret',
    RAGEN_VAULT_URL: 'url',
    RAGEN_VAULT_SERVICE_SECRET: 'secret',
  },
  pairs: [
    {
      vars: ['RAGEN_TOKEN_VAULT_URL', 'RAGEN_TOKEN_VAULT_SERVICE_SECRET'],
      label: 'The token vault',
    },
    {
      vars: ['RAGEN_VAULT_URL', 'RAGEN_VAULT_SERVICE_SECRET'],
      label: 'The vault',
    },
  ],
  summary:
    'Connector OAuth tokens and API keys (ADR-32). Each URL and its secret are all-or-nothing: a URL without its secret produces 401s rather than a legible error.',
} as const satisfies FieldGroup;

export const FIELD_GROUPS = [
  DATABASE_GROUP,
  GATEWAY_GROUP,
  VECTOR_STORE_GROUP,
  MODELS_GROUP,
  TEMPORAL_GROUP,
  REDIS_GROUP,
  OBSERVABILITY_GROUP,
  TOKEN_VAULT_GROUP,
] as const;
