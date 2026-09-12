import { isDeployedEnv, normalizeTargetEnv } from '@ragenai/env';
import { isEncryptionConfigured } from './key-provider';

/**
 * Whether this process must have an encryption provider configured before it
 * can persist thread/document content.
 *
 * Mirrors `apps/worker/src/services/llm/require-master-key.ts`'s
 * `isMasterKeyRequired` — same two escape hatches, for the same reasons:
 *
 * - a development or test `NODE_ENV`, which covers `npm run dev` and every
 *   test runner regardless of what `TARGET_ENV` says;
 * - a `TARGET_ENV` that is not a deployment (`isDeployedEnv`), which covers a
 *   CI run or an e2e suite.
 *
 * An **unset or blank** `TARGET_ENV` reads as a deployment rather than an
 * excuse — a container that never received its configuration is exactly the
 * case this exists for. That is the opposite of how `apps/web`'s
 * `config/env.ts` treats an unset `TARGET_ENV` (it defaults to `local` for a
 * fresh clone's DX); the two are allowed to differ because they answer
 * different questions — "should this variable be required" vs. "should this
 * process refuse to store plaintext".
 */
export function isEncryptionRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return false;
  }

  const targetEnv = normalizeTargetEnv(env.TARGET_ENV);
  return targetEnv === undefined || isDeployedEnv(targetEnv);
}

/**
 * The explicit, conscious opt-out for a deployment that has decided to run
 * without encryption. Kept separate from `isEncryptionRequired` so a caller
 * can tell "not required" apart from "required, but waived" — the second one
 * is worth a security event, the first is not.
 */
export function isEncryptionRequirementBypassed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ALLOW_UNENCRYPTED === '1';
}

export type EncryptionStartupStatus = 'ok' | 'bypassed' | 'blocked';

/**
 * The single source of truth for "can this process start/persist content",
 * consumed identically by the write-path guard below, apps/api's boot exit,
 * and apps/web's blocking page — one function rather than three copies of
 * the same three-way branch.
 */
export function getEncryptionStartupStatus(
  env: NodeJS.ProcessEnv = process.env,
): EncryptionStartupStatus {
  if (isEncryptionConfigured()) {
    return 'ok';
  }
  if (!isEncryptionRequired(env)) {
    return 'ok';
  }
  return isEncryptionRequirementBypassed(env) ? 'bypassed' : 'blocked';
}

/** Thrown by `assertEncryptionAvailable()` when a write path must refuse. */
export class EncryptionRequiredError extends Error {
  constructor() {
    super(
      'Encryption is required in this environment but no key provider is ' +
        'configured. Set ENCRYPTION_PROVIDER ("scaleway", "kms" or "local") ' +
        'and its credentials, or set ALLOW_UNENCRYPTED=1 to explicitly run ' +
        'without it.',
    );
    this.name = 'EncryptionRequiredError';
  }
}

/**
 * Call at every content write path that currently branches on
 * `isEncryptionEnabled()` — throws only when encryption is required and
 * neither configured nor explicitly waived. The alternative is repeating the
 * required/bypassed logic at each call site, which is exactly how this
 * package's two historical drifts happened (see the module doc in
 * `index.ts`).
 */
export function assertEncryptionAvailable(): void {
  if (getEncryptionStartupStatus() === 'blocked') {
    throw new EncryptionRequiredError();
  }
}
