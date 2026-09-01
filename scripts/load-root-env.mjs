import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * Fill in local configuration the calling app did not set itself, from the
 * repository root.
 *
 * ADR-29 moved the main app from the root into `apps/web`, and its `.env.local`
 * stayed behind — Next reads env files from the app directory and does not walk
 * up, so that file stopped being read by anything. Meanwhile `apps/admin` grew
 * its own copy: seven of its eight values were duplicates of the root's.
 *
 * Precedence, verified rather than assumed:
 *
 *   1. real environment variables  — a production container's own config
 *   2. the app's own .env files    — Next loads these before this runs
 *   3. the repository root         — this function, gaps only
 *
 * `dotenv.config` does not override what is already set, which is what makes
 * that order hold. Nothing here affects production: containers receive
 * variables, not files, and those variables win outright.
 *
 * Not `loadEnvConfig` from @next/env — it caches after the first call, so a
 * second invocation for the root is silently a no-op.
 */
export function loadRootEnv() {
  for (const file of ['.env.local', '.env']) {
    const candidate = path.join(ROOT, file);
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, quiet: true });
    }
  }
}

loadRootEnv();
