export async function register() {
  console.log(
    '[otel] register() called, NEXT_RUNTIME =',
    process.env.NEXT_RUNTIME,
  );

  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
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
