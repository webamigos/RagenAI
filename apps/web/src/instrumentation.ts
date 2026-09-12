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
  const { getEncryptionStartupStatus } = await import('@ragenai/crypto');
  const encryptionStatus = getEncryptionStartupStatus();
  if (encryptionStatus === 'blocked') {
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
