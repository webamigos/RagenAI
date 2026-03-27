export default function globalTeardown() {
  if (globalThis.__mockLlmProcess) {
    console.log('[global-teardown] Stopping mock LLM server...');
    globalThis.__mockLlmProcess.kill();
    globalThis.__mockLlmProcess = undefined;
  }
}
