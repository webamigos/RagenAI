/**
 * Manual Jest mock for franc.
 *
 * detect-document-language.ts uses `await import('franc')` (a dynamic
 * import). The worker's jest.config.ts forces ts-jest to compile to
 * `module: 'commonjs'` so dynamic imports downlevel to `require()` and
 * jest.mock() can intercept them (see the sibling
 * `@qdrant/js-client-rest.ts` mock for the same pattern) — but franc ships
 * ESM-only with no CommonJS build, so a real `require('franc')` throws
 * `ERR_REQUIRE_ESM` even after downleveling. This moduleNameMapper redirect
 * provides a synchronously-loadable stand-in instead.
 *
 * Tests configure this mock's return value per case rather than asserting
 * on franc's actual linguistic detection — that's franc's own test suite's
 * job, not this worker's.
 */

export const franc = jest.fn().mockReturnValue('und');
