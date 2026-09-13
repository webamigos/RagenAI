export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Report a bad configuration at startup rather than on whichever page
  // needed the variable — which is how this panel behaved until it got a
  // contract of its own (ADR-37).
  //
  // It reports and continues, like apps/web and unlike apps/api and the
  // worker. See `config/env.ts` for why: the panel is built to run partially
  // configured and show an operator what is missing, and a process that exits
  // shows nothing.
  //
  // Dynamic import keeps zod and the Node-only helpers out of the Edge
  // bundle's static analysis.
  const { parseAdminEnv } = await import('./config/env');
  const env = parseAdminEnv();
  if (!env.ok) {
    // console, not an app logger: the logger would read configuration that
    // has just been established as untrustworthy.
    console.error(env.report);
  }

  // OpenTelemetry is deliberately not registered here — this app does not use it.
}
