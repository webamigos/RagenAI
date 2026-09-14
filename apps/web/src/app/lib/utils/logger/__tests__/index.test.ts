import { describe, expect, it } from 'vitest';

/**
 * This module is four lines of wiring, and it is the only place in apps/web
 * that reaches for `require` inside an ESM package. That works because webpack
 * and Turbopack supply one — and it is invisible to every static check that
 * plain Node does not, so each of the eight scripts in `src/scripts/` that
 * touches this module died on import with
 * `ReferenceError: require is not defined` and nothing said so.
 *
 * Importing it at all is therefore the assertion worth making: vitest runs
 * this file through Vite as real ESM, the same shape the scripts run in.
 */
describe('the logger picks an implementation without a bundler', () => {
  it('imports and exposes a usable logger', async () => {
    const { logger } = await import('../index');

    expect(logger).toBeDefined();
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      expect(typeof logger[level]).toBe('function');
    }
  });

  it('does not throw when a level is actually called', async () => {
    const { logger } = await import('../index');

    // The old version could resolve to a module object rather than a logger
    // when the `require` fallback misfired, which only showed up at the first
    // call site rather than on import.
    expect(() => logger.info('logger binding smoke test')).not.toThrow();
  });
});
