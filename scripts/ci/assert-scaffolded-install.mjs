#!/usr/bin/env node
/**
 * Checks that a directory produced by `create-ragen-app` is actually
 * configured, rather than merely present.
 *
 * The installer's unit tests mock the filesystem, so they prove the logic and
 * not the result. Everything asserted here has been shipped broken at least
 * once: a chat model with no matching route, a rephrase model still pointing at
 * credentials the install does not have, an embedding model it cannot serve,
 * and a DATABASE_URL on the port a native Postgres answers on.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const targetDir = process.argv[2];
// `--appliance`: the install was scaffolded with `--appliance` — local models,
// no provider key — so the provider half below is replaced by its own.
const appliance = process.argv.includes('--appliance');

if (!targetDir) {
  console.error('usage: assert-scaffolded-install.mjs <dir> [--appliance]');
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
const composeEnv = read('.env');
const routes = read('infra/llm-gateway/routes.yaml');

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

if (appliance) {
  assertAppliance();
} else {
  assertProvider();
}

// The wizard configured the models, so the manual fallback should not be
// there to contradict it.
if (existsSync(join(targetDir, 'SETUP-LLM.md'))) {
  failures.push(
    'SETUP-LLM.md was written even though a provider was configured',
  );
}

// Every model named in .env.local has to have a route, or resolving it throws
// UnknownModelError on the first question.
for (const key of [
  'DEFAULT_MODEL',
  'REPHRASE_MODEL',
  'SUMMARY_MODEL',
  'SCORING_MODEL',
  'EMBEDDINGS_MODEL',
  ...(appliance ? ['MULTIMODAL_FALLBACK_MODEL'] : []),
]) {
  const model = envValue(rootEnv, key);
  if (model && !new RegExp(`^  ${model}:$`, 'm').test(routes)) {
    failures.push(
      `infra/llm-gateway/routes.yaml has no route for ${model}, which .env.local selects as ${key}`,
    );
  }
}

/**
 * An appliance: every model on this machine, nothing that can leave it.
 * The installer checks the route table before writing it; this checks what
 * it wrote, from the published package against this commit's files.
 */
function assertAppliance() {
  for (const [key, expected] of [
    ['DEFAULT_MODEL', 'local-chat'],
    ['EMBEDDINGS_MODEL', 'local-embed'],
    // bge-m3's dimensionality; anything else and Qdrant rejects every upsert.
    ['VECTOR_SIZE', '1024'],
    // Without it a failed Docling parse sends the file to a cloud model.
    ['DOCLING_STRICT', '1'],
    ['STORAGE_PROVIDER', 'local'],
    ['ENCRYPTION_PROVIDER', 'local'],
  ]) {
    expectEnv(
      rootEnv,
      '.env.local',
      key,
      (value) => value === expected,
      expected,
    );
  }

  // No key was asked for, and none may arrive from the caller's environment:
  // CI sets OPENAI_API_KEY for the provider run above this one.
  for (const key of [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENROUTER_API_KEY',
    'SCW_API_KEY',
  ]) {
    const value = envValue(rootEnv, key);
    if (value) {
      failures.push(`.env.local: ${key} is set in an appliance install`);
    }
  }

  // Every route on the local model server. Read line by line, like the
  // installer: two-space ids, four-space fields.
  const routeIds = [...routes.matchAll(/^ {2}([^\s:#][^:]*):\s*$/gm)].map(
    (match) => match[1],
  );
  if (routeIds.length === 0) {
    failures.push('infra/llm-gateway/routes.yaml has no routes');
  }
  for (const match of routes.matchAll(/^ {4}provider:\s*(\S+)/gm)) {
    if (match[1] !== 'openai-compatible') {
      failures.push(
        `infra/llm-gateway/routes.yaml has a provider: ${match[1]} route, which leaves the machine`,
      );
    }
  }
  for (const match of routes.matchAll(/^ {4}connection:\s*(\S+)/gm)) {
    if (match[1] !== 'ollama') {
      failures.push(
        `infra/llm-gateway/routes.yaml has a connection: ${match[1]} route, not the local Ollama`,
      );
    }
  }

  // The profile: Compose reads COMPOSE_FILE from `.env`, so a plain
  // `docker compose up -d` starts the appliance, model server included.
  const composeFile = envValue(composeEnv, 'COMPOSE_FILE');
  if (!composeFile?.split(/[:;]/).includes('docker-compose.appliance.yml')) {
    failures.push(
      `.env: COMPOSE_FILE=${composeFile ?? ''} does not include docker-compose.appliance.yml`,
    );
  } else {
    for (const file of composeFile.split(/[:;]/)) {
      if (!existsSync(join(targetDir, file))) {
        failures.push(`.env: COMPOSE_FILE names ${file}, which does not exist`);
      }
    }
  }
}

// --- The provider the run configured -------------------------------------
function assertProvider() {
  const chatModel = envValue(rootEnv, 'DEFAULT_MODEL');

  expectEnv(
    rootEnv,
    '.env.local',
    'DEFAULT_MODEL_PROVIDER',
    nonEmpty,
    'litellm',
  );
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

  // The shipped table routes to Azure, Bedrock, Vertex and Scaleway. A scaffold
  // that left it in place would offer models this install has no keys for.
  if (routes.includes('provider: vertex')) {
    failures.push(
      'infra/llm-gateway/routes.yaml is still the shipped table — the scaffold should have replaced it',
    );
  }
}

// Compose reads `.env` from the project directory, so this line is what keeps
// two installs apart after the wizard has exited. Written by the installer
// rather than by the repository, so nothing in the clone would reveal its
// absence — and without it Compose falls back to the directory basename, which
// a second install in a directory of the same name would share, volumes and
// all.
const composeProject = envValue(composeEnv, 'COMPOSE_PROJECT_NAME');
if (!composeProject) {
  failures.push(
    '.env: COMPOSE_PROJECT_NAME is unset, so Compose falls back to the directory name',
  );
} else if (!/^[a-z0-9][a-z0-9_-]*$/.test(composeProject)) {
  failures.push(
    `.env: COMPOSE_PROJECT_NAME="${composeProject}" is not a name Compose accepts ([a-z0-9][a-z0-9_-]*), so every compose command would fail`,
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
