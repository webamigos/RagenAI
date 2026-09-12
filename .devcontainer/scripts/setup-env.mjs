/**
 * Fills in the generated secrets a fresh .env.local needs, and — in a
 * Codespace — the two app URLs that cannot be localhost there.
 *
 * It reuses create-ragen-app's manifest rather than restating which keys need
 * a secret. That list already exists, is already kept in step with
 * packages/env and both .env.example files by
 * tests/architecture/create-ragen-app-manifest-is-current.test.ts, and a
 * second copy here would be the fourth place in the repository that knows
 * about SECRET_KEY. Container networking is not in scope: those values are
 * real environment variables set in docker-compose.devcontainer.yml, and real
 * environment variables win over every env file.
 *
 * Idempotent, because it runs again on every container rebuild:
 *
 *   - a .env.local still byte-identical to its .env.example is a first run,
 *     and gets the whole manifest;
 *   - otherwise only keys that are still empty are filled, so a pasted API
 *     key or a hand-edited value is never overwritten.
 *
 * Run by post-create.sh, after npm install has built the workspace packages.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const CREATE_RAGEN_APP = join(ROOT, 'packages', 'create-ragen-app', 'dist');
const { MANIFEST, entriesForTarget } = require(
  join(CREATE_RAGEN_APP, 'manifest.js'),
);
const { applyEnvOverrides } = require(join(CREATE_RAGEN_APP, 'env-file.js'));
const { generateSecret } = require(join(CREATE_RAGEN_APP, 'secrets.js'));

const ENV_PATHS = {
  root: { example: '.env.example', local: '.env.local' },
  admin: { example: 'apps/admin/.env.example', local: 'apps/admin/.env.local' },
};

/**
 * A Codespace serves each forwarded port on its own https host, so the
 * localhost URLs the examples ship with break sign-in: Better Auth issues the
 * cookie for an origin the browser never visits. Empty outside Codespaces,
 * where localhost is correct.
 */
function codespaceUrls(target) {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name || !domain) {
    return {};
  }

  const urlFor = (port) => `https://${name}-${port}.${domain}`;
  return target === 'admin'
    ? {
        BETTER_AUTH_URL: urlFor(3200),
        NEXT_PUBLIC_APP_URL: urlFor(3200),
        RAGEN_APP_URL: urlFor(3000),
      }
    : { BETTER_AUTH_URL: urlFor(3000), NEXT_PUBLIC_APP_URL: urlFor(3000) };
}

/** The first assignment of `key`, commented or not, or null when absent. */
function currentValue(content, key) {
  const match = new RegExp(`^#?\\s*${key}=(.*)$`, 'm').exec(content);
  return match ? match[1].trim() : null;
}

function isUnset(value) {
  return value === null || value === '' || value === '""' || value === "''";
}

/** Resolved once for the whole run, so an entry with two targets shares one value. */
const resolved = new Map(
  MANIFEST.map((entry) => [
    entry,
    entry.strategy === 'generate-secret' ? generateSecret() : entry.value,
  ]),
);

let wroteSomething = false;

for (const target of ['root', 'admin']) {
  const { example, local } = ENV_PATHS[target];
  const template = readFileSync(join(ROOT, example), 'utf8');
  const content = readFileSync(join(ROOT, local), 'utf8');
  const firstRun = content === template;

  const overrides = {};
  for (const entry of entriesForTarget(target)) {
    if (firstRun || isUnset(currentValue(content, entry.key))) {
      overrides[entry.key] = resolved.get(entry);
    }
  }
  for (const [key, url] of Object.entries(codespaceUrls(target))) {
    if (currentValue(content, key) === currentValue(template, key)) {
      overrides[key] = url;
    }
  }

  const keys = Object.keys(overrides);
  if (keys.length === 0) {
    console.log(`${local}: nothing to fill in.`);
    continue;
  }

  const result = applyEnvOverrides(content, overrides);
  writeFileSync(join(ROOT, local), result.content, { mode: 0o600 });
  wroteSomething = true;
  console.log(`${local}: set ${keys.sort().join(', ')}.`);

  if (result.missingKeys.length > 0) {
    console.warn(
      `WARNING: ${local} has no line for ${result.missingKeys.join(', ')} — ` +
        "create-ragen-app's manifest and this .env.example have drifted.",
    );
  }
}

if (wroteSomething && (process.env.CODESPACE_NAME ?? '') !== '') {
  console.log(
    'App URLs point at this Codespace. Sign-in would not work with the localhost defaults.',
  );
}
