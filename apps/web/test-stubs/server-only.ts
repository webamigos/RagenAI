// `server-only` throws on import by design, to catch a server module reaching a
// client bundle at build time. Under Vitest there is no such boundary to
// protect, so importing it would fail every test that touches a server module
// — the alias in vitest.config.ts points here instead.
export {};
