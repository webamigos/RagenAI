#!/usr/bin/env node
/**
 * Checks that a directory produced by `create-ragen-app` is actually
 * configured, rather than merely present.
 *
 * The installer's unit tests mock the filesystem, so they prove the logic and
 * not the result. Everything asserted here has been shipped broken at least
 * once: a chat model with no matching LiteLLM entry, a rephrase model still
 * pointing at credentials the install does not have, an embedding model it
 * cannot serve, a master key the app never sends, and a DATABASE_URL on the
 * port a native Postgres answers on.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const targetDir = process.argv[2];

if (!targetDir) {
  console.error('usage: assert-scaffolded-install.mjs <dir>');
  process.exit(2);
}

const failures = [];

function read(relativePath) {
  const path = join(targetDir, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath} was not created`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

const rootEnv = read('.env.local');
const adminEnv = read('apps/admin/.env.local');
const liteLLM = read('infra/litellm/config.yaml');

function envValue(contents, key) {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(contents);
  return match?.[1]?.trim();
}

function expectEnv(contents, file, key, predicate, expectation) {
  const value = envValue(contents, key);
  if (value === undefined) {
    failures.push(`${file}: ${key} is unset or still commented out`);
    return;
  }
  if (!predicate(value)) {
    failures.push(`${file}: ${key}=${value} — expected ${expectation}`);
  }
}

const nonEmpty = (value) => value.length > 0;

// Generated secrets: present, and not the placeholder they replace.
for (const key of [
  'SECRET_KEY',
  'BETTER_AUTH_SECRET',
  'PUBLIC_LINK_TOKEN_SECRET',
  'SESSION_AUTH_SECRET',
  'INTERNAL_API_SECRET',
]) {
  expectEnv(rootEnv, '.env.local', key, nonEmpty, 'a generated value');
}
expectEnv(
  rootEnv,
  '.env.local',
  'WORKER_SECRET_KEY',
  (value) => value.length > 0 && value !== 'worker-secret-key',
  'a generated value, not the shipped placeholder',
);

// Shared across both env files, or apps/admin cannot call apps/web.
if (
  envValue(rootEnv, 'INTERNAL_API_SECRET') !==
  envValue(adminEnv, 'INTERNAL_API_SECRET')
) {
  failures.push(
    'INTERNAL_API_SECRET differs between .env.local and apps/admin/.env.local',
  );
}

// Independent, or one leaked session signs into the other surface.
if (
  envValue(rootEnv, 'BETTER_AUTH_SECRET') ===
  envValue(adminEnv, 'BETTER_AUTH_SECRET')
) {
  failures.push(
    'BETTER_AUTH_SECRET is shared between root and apps/admin; they must differ',
  );
}

// docker-compose publishes Postgres on 55432; 5432 reaches whatever the host
// happens to be running, while reporting success.
for (const [contents, file] of [
  [rootEnv, '.env.local'],
  [adminEnv, 'apps/admin/.env.local'],
]) {
  expectEnv(
    contents,
    file,
    'DATABASE_URL',
    (value) => value.includes(':55432/'),
    "the container's published port 55432",
  );
}

// The app sends no Authorization header without this, and the proxy answers
// every call with a 401.
expectEnv(
  rootEnv,
  '.env.local',
  'LITELLM_MASTER_KEY',
  nonEmpty,
  'the value docker-compose starts the proxy with',
);

// --- The provider the run configured -------------------------------------
const chatModel = envValue(rootEnv, 'DEFAULT_MODEL');
const embeddingsModel = envValue(rootEnv, 'EMBEDDINGS_MODEL');

expectEnv(rootEnv, '.env.local', 'DEFAULT_MODEL_PROVIDER', nonEmpty, 'litellm');
expectEnv(
  rootEnv,
  '.env.local',
  'OPENAI_API_KEY',
  nonEmpty,
  'the key from the environment',
);

// Multi-query expansion runs on every turn, so a rephrase model the install
// has no credentials for fails the chain before the chat model is reached.
expectEnv(
  rootEnv,
  '.env.local',
  'REPHRASE_MODEL',
  (value) => value === chatModel,
  `the configured chat model (${chatModel})`,
);

// EMBEDDINGS_MODEL and VECTOR_SIZE have to agree, or Qdrant rejects every
// upsert without anything in the app noticing.
expectEnv(
  rootEnv,
  '.env.local',
  'EMBEDDINGS_MODEL',
  (value) => value === 'text-embedding-3-small',
  'the provider’s embedding model',
);
expectEnv(
  rootEnv,
  '.env.local',
  'VECTOR_SIZE',
  (value) => value === '1536',
  "text-embedding-3-small's dimensionality",
);

// Every model named in .env.local has to exist in the proxy's config, or the
// call 404s at request time.
for (const model of [chatModel, embeddingsModel]) {
  if (model && !liteLLM.includes(`model_name: ${model}`)) {
    failures.push(
      `infra/litellm/config.yaml has no model_list entry for ${model}, which .env.local selects`,
    );
  }
}

// The wizard configured a provider, so the manual fallback should not be
// there to contradict it.
if (existsSync(join(targetDir, 'SETUP-LLM.md'))) {
  failures.push(
    'SETUP-LLM.md was written even though a provider was configured',
  );
}

if (failures.length > 0) {
  console.error(`Scaffolded install is not usable (${failures.length}):\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Scaffolded install looks configured.');
