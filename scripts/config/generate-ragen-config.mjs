#!/usr/bin/env node
/**
 * Regenerates the repository's own `ragen.config.ts` from the installer's
 * template, with the answers a fresh clone has: files on disk, no encryption.
 *
 * The file is committed because `typecheck:config` compiles it — that is what
 * makes "choosing s3 without a bucket does not compile" a checked claim — and
 * because a clone must have one before the installer ever runs.
 *
 * `tests/architecture/ragen-config-is-generated.test.ts` compares the two, so
 * the template and the shipped file cannot drift. That matters more than it
 * sounds: the installer overwrites this file wholesale, so anything edited
 * here by hand and not put in the template is discarded on the next scaffold.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  renderRagenConfig,
} = require('create-ragen-app/dist/config-template.js');
const {
  resolveStorageSelection,
} = require('create-ragen-app/dist/storage-provider.js');
const {
  resolveEncryptionSelection,
} = require('create-ragen-app/dist/encryption-provider.js');

export function renderShippedConfig() {
  return renderRagenConfig(
    resolveStorageSelection('local'),
    resolveEncryptionSelection('none'),
  );
}

const target = join(import.meta.dirname, '..', '..', 'ragen.config.ts');

if (process.argv[1] === import.meta.filename) {
  writeFileSync(target, renderShippedConfig());
  console.log(`wrote ${target}`);
}
