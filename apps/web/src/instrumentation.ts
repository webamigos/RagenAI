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
