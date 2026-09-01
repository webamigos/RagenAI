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
  'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';

const REQUIRED: Array<Omit<SetupFinding, 'severity'>> = [
  {
    id: 'database',
    vars: ['DATABASE_URL'],
    example: 'postgresql://postgres:pass123@localhost:5432/smartrag',
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
    id: 'app-url',
    vars: ['NEXT_PUBLIC_APP_URL'],
    example: 'https://ragen.example.com',
  },
  {
    id: 'message-encryption',
    vars: [
      'SCW_KEY_MANAGER_KEY_ID',
      'AWS_KMS_KEY_ID',
      'ENCRYPTION_MASTER_KEY',
    ],
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
