export default function globalTeardown() {
  if (globalThis.__mockLlmProcess) {
    console.log('[global-teardown] Stopping mock LLM server...');
    globalThis.__mockLlmProcess.kill();
    globalThis.__mockLlmProcess = undefined;
  }

  // Only ever set when *this* run started it — in CI the workflow owns the
  // process, and a teardown that killed a stranger on the port would be the
  // same mistake as trusting one.
  if (globalThis.__appsApiProcess) {
    console.log('[global-teardown] Stopping apps/api...');
    globalThis.__appsApiProcess.kill();
    globalThis.__appsApiProcess = undefined;
  }
}
