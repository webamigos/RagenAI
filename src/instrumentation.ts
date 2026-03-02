export async function register() {
  console.log(
    '[otel] register() called, NEXT_RUNTIME =',
    process.env.NEXT_RUNTIME,
  );

  if (process.env.NEXT_RUNTIME !== 'nodejs') {return;}

  // Dynamic import keeps Node.js-only APIs (process.exit, process.on)
  // out of the Edge Runtime static analysis.
  const { registerOtel } = await import('./instrumentation.node');
  await registerOtel();
}
