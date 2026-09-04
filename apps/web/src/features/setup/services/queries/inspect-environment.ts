import {
  DEFAULT_EMBEDDINGS_MODEL,
  DEFAULT_VECTOR_SIZE,
} from '@ragenai/rag-core';

import type { SetupFinding, SetupReport } from '../../contracts/types';

/**
 * Dimensionality of the embedding models we ship configuration for. Used to
 * catch a VECTOR_SIZE that contradicts EMBEDDINGS_MODEL, which otherwise shows
 * up as every Qdrant upsert being rejected long after ingest looked fine.
 */
const KNOWN_MODEL_DIMENSIONS: Record<string, number> = {
  [DEFAULT_EMBEDDINGS_MODEL]: DEFAULT_VECTOR_SIZE,
  'cohere-embed-multilingual-v3': 1024,
};

const isSet = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

type Env = Record<string, string | undefined>;

const GENERATE_HEX_32 =
  "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";

const REQUIRED: Array<Omit<SetupFinding, 'severity'>> = [
  {
    id: 'database',
    vars: ['DATABASE_URL'],
    example: 'postgresql://postgres:pass123@localhost:55432/smartrag',
  },
  {
    id: 'auth-secret',
    vars: ['BETTER_AUTH_SECRET'],
    example: GENERATE_HEX_32,
  },
  {
    id: 'secret-key',
    vars: ['SECRET_KEY'],
    example: GENERATE_HEX_32,
  },
  {
    id: 'llm-gateway',
    vars: ['LITELLM_PROXY_URL'],
    example: 'http://localhost:4000',
  },
  {
    id: 'default-model',
    vars: ['DEFAULT_MODEL', 'DEFAULT_MODEL_PROVIDER'],
    example:
      'DEFAULT_MODEL=gemini-3-flash-preview DEFAULT_MODEL_PROVIDER=litellm',
  },
];

const RECOMMENDED: Array<Omit<SetupFinding, 'severity'>> = [
  {
    id: 'vector-store',
    vars: ['QDRANT_URL'],
    example: 'http://localhost:6333',
  },
  {
    id: 'temporal',
    vars: ['TEMPORAL_SERVER_ADDRESS'],
    example: 'localhost:7233',
  },
  {
    // Either transport satisfies this; without one, mail is only logged.
    id: 'mail',
    vars: ['RESEND_API_KEY', 'SMTP_HOST'],
    example: 'SMTP_HOST=smtp.example.com, or RESEND_API_KEY=re_...',
  },
  {
    // Either satisfies this. `BETTER_AUTH_URL` is what Better Auth signs its
    // own email links with and what `emails/utils/base-url.ts` prefers;
    // `NEXT_PUBLIC_APP_URL` is the build-time-inlined alternative.
    id: 'app-url',
    vars: ['BETTER_AUTH_URL', 'NEXT_PUBLIC_APP_URL'],
    example: 'https://ragen.example.com',
  },
  {
    // Not just a label: it selects the OTel `deployment.environment.name`, and
    // `emails/utils/base-url.ts` only falls back to localhost when it says
    // `local`, so an unset value on a real deployment is worth surfacing.
    id: 'target-env',
    vars: ['TARGET_ENV'],
    example: 'local / staging / production',
  },
  {
    id: 'message-encryption',
    vars: ['SCW_KEY_MANAGER_KEY_ID', 'AWS_KMS_KEY_ID', 'ENCRYPTION_MASTER_KEY'],
    example:
      'ENCRYPTION_MASTER_KEY=<64 hex chars> locally, or a KMS key id in production',
  },
];

/**
 * Report what an operator still has to configure.
 *
 * Pure and env-injected so it can be exercised without touching `process.env`,
 * and so a caller can run it against a candidate environment rather than only
 * against the running one.
 *
 * A `recommended` group is satisfied by *any* of its variables — the mail and
 * encryption groups are alternatives, not a checklist. A `required` group needs
 * all of them, since those genuinely have no fallback.
 */
export function inspectEnvironment(env: Env): SetupReport {
  const findings: SetupFinding[] = [];

  for (const check of REQUIRED) {
    const missing = check.vars.filter((name) => !isSet(env[name]));
    if (missing.length > 0) {
      findings.push({ ...check, severity: 'required', vars: missing });
    }
  }

  for (const check of RECOMMENDED) {
    if (!check.vars.some((name) => isSet(env[name]))) {
      findings.push({ ...check, severity: 'recommended' });
    }
  }

  const embeddingsMismatch = findEmbeddingsMismatch(env);
  if (embeddingsMismatch) {
    findings.push(embeddingsMismatch);
  }

  const objectStorageMisconfig = findObjectStorageMisconfiguration(env);
  if (objectStorageMisconfig) {
    findings.push(objectStorageMisconfig);
  }

  return {
    findings,
    hasBlockingIssues: findings.some((f) => f.severity === 'required'),
  };
}

/**
 * EMBEDDINGS_MODEL and VECTOR_SIZE have to agree. When they don't, Qdrant
 * rejects every upsert with a dimension error that names neither variable, so
 * it is worth saying so up front.
 */
function findEmbeddingsMismatch(env: Env): SetupFinding | null {
  // Both variables have runtime defaults, so setting only one is the more
  // dangerous case, not a safer one: EMBEDDINGS_MODEL=cohere-embed-multilingual-v3
  // on its own leaves VECTOR_SIZE at 3584 and every upsert is rejected. Resolve
  // each side the way the running app does before comparing.
  const model = isSet(env.EMBEDDINGS_MODEL)
    ? env.EMBEDDINGS_MODEL.trim()
    : DEFAULT_EMBEDDINGS_MODEL;
  const configured = isSet(env.VECTOR_SIZE)
    ? env.VECTOR_SIZE.trim()
    : String(DEFAULT_VECTOR_SIZE);

  const expected = KNOWN_MODEL_DIMENSIONS[model];
  if (expected === undefined || String(expected) === configured) {
    return null;
  }

  return {
    id: 'embeddings-dimension-mismatch',
    severity: 'required',
    vars: ['EMBEDDINGS_MODEL', 'VECTOR_SIZE'],
    values: { model, expected, configured },
    example: `VECTOR_SIZE=${expected}`,
  };
}

/**
 * Only relevant once an operator opts into `STORAGE_PROVIDER=s3` — local is
 * the default and needs none of this. Every var here is `S3_`-prefixed, not
 * `AWS_`: those names are also read by AWS Bedrock and the AWS KMS encryption
 * provider, so reusing them here would make the two configs fight over one
 * slot (credentials, but also endpoint/region — KMS would try to reach
 * Scaleway's endpoint as if it were AWS's). See
 * docs/adrs/27-storage-abstraction-local-by-default.md's Update section.
 */
function findObjectStorageMisconfiguration(env: Env): SetupFinding | null {
  if (env.STORAGE_PROVIDER?.trim() !== 's3') {
    return null;
  }

  const missing = [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_BUCKET_NAME',
    'S3_REGION',
  ].filter((name) => !isSet(env[name]));

  if (missing.length === 0) {
    return null;
  }

  return {
    id: 'object-storage-credentials',
    severity: 'required',
    vars: missing,
    example:
      'S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_BUCKET_NAME=... S3_REGION=...',
  };
}
