export async function register() {
  console.log(
    '[otel] register() called, NEXT_RUNTIME =',
    process.env.NEXT_RUNTIME,
  );

  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Report a bad configuration at startup rather than at the first chat, the
  // first upload or the first invitation email — which is how apps/web
  // behaved until it got a contract of its own (ADR-37).
  //
  // It reports and continues. apps/api and the worker exit on a bad parse;
  // this app must not, because it serves the first-run setup page that tells
  // an operator which variable to fix (see AGENTS.md, "Key Conventions", and
  // `features/setup`). Exiting here would take down the only screen that
  // explains the failure, turning a fixable misconfiguration into a boot loop
  // with the answer trapped inside it.
  //
  // Dynamic import for the same reason as the OTel one below: this pulls in
  // zod and Node-only helpers that the Edge bundle must not static-analyse.
  const { parseWebEnv } = await import('./config/env');
  const env = parseWebEnv();
  if (!env.ok) {
    // console, not the app logger: the logger reads configuration that has
    // just been established as untrustworthy.
    console.error(env.report);
  }

  // Encryption is required in a deployed environment (docs/thread-encryption.md).
  // This process does not exit on that — `[locale]/layout.tsx` renders a
  // blocking screen instead, for the reason documented there. This just makes
  // the two non-'ok' outcomes visible in the container logs, and — for the
  // explicit ALLOW_UNENCRYPTED=1 opt-out only — records a security event once
  // per boot rather than once per message.
  const { getEncryptionStartupStatus, probeEncryptionProvider } =
    await import('@ragenai/crypto');

  // Set is not the same as usable, and only one of the two is free to check.
  // A key the credentials may not use answers 403 on the first message and
  // nowhere earlier, so this wraps and unwraps one throwaway data key to find
  // out here instead. It never throws; `blocked` below covers the fatal case.
  const probe = await probeEncryptionProvider();
  if (probe.status === 'unavailable') {
    console.warn(
      `[security] Could not verify the ${probe.provider} encryption provider ` +
        `at startup: ${probe.detail}. Continuing — this looks transient, and ` +
        'blocking every request on one bad second at boot would be worse. ' +
        'Writes will fail individually if it was not.',
    );
  }

  const encryptionStatus = getEncryptionStartupStatus();
  if (encryptionStatus === 'blocked' && probe.status === 'misconfigured') {
    console.error(
      `[security] The ${probe.provider} encryption provider is configured but ` +
        `unusable: ${probe.detail}. Every request will be served the blocking ` +
        'screen until it works. Check that the credentials may use this ' +
        'specific key, and that the key id and region name a key they can ' +
        'reach — see docs/thread-encryption.md.',
    );
  } else if (encryptionStatus === 'blocked') {
    console.error(
      '[security] No encryption provider configured in a deployed environment. ' +
        'Every request will be served the blocking screen until ENCRYPTION_PROVIDER ' +
        '(and its credentials) is set, or ALLOW_UNENCRYPTED=1 is set to opt out.',
    );
  } else if (encryptionStatus === 'bypassed') {
    console.warn(
      '[security] ALLOW_UNENCRYPTED=1 — starting without message/document ' +
        'encryption in a deployed environment.',
    );
    const { recordSecurityEvent } =
      await import('./features/security/services/commands/record-security-event-command');
    recordSecurityEvent({
      eventType: 'ENCRYPTION_REQUIREMENT_BYPASSED',
      severity: 'critical',
      source: 'infra',
      metadata: { targetEnv: process.env.TARGET_ENV ?? null },
    });
  }

  // Same shape as the encryption checks above, and for the same reason: a
  // security control that stops applying should say so once at boot rather
  // than never. `FEATURE_FLAG_PII_MASKING=1` was the whole switch until
  // availability moved to the Presidio URLs, so an upgrade carrying the flag
  // and relying on the old built-in defaults now masks nothing.
  const { isPiiMaskingMisconfigured, PII_MASKING_MISCONFIGURED_MESSAGE } =
    await import('@ragenai/env');
  if (isPiiMaskingMisconfigured()) {
    console.error(`[security] ${PII_MASKING_MISCONFIGURED_MESSAGE}`);
  }

  // Subscribers rely on Node-only imports (mailer, Prisma). Gated on
  // NEXT_RUNTIME above so Edge bundles never pull them in.
  const { registerAllSubscribers } = await import('./libs/events/subscribers');
  registerAllSubscribers();

  // Skip instrumentation for apps that don't need it (e.g. ragen-admin)
  if (process.env.DISABLE_OTEL === '1') {
    return;
  }

  // Dynamic import keeps Node.js-only APIs (process.exit, process.on)
  // out of the Edge Runtime static analysis.
  const { registerOtel } = await import('./instrumentation.node');
  await registerOtel();
}
