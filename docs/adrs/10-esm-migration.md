# ADR-10: ESM Migration

**Status:** Accepted
**Date:** 2026-02-01

## Context

The project originally used CommonJS (`require`/`module.exports`). Modern tooling (Prisma v7, Vitest, newer npm packages) increasingly requires or works better with ESM. Mixed CJS/ESM caused import resolution issues and bundler warnings.

## Decision

Full ESM migration:

- `"type": "module"` in `package.json` — all `.js` files treated as ESM
- CommonJS scripts renamed to `.cjs` extension (`postcss.config.cjs`, vector-store scripts)
- tsconfig: `target: "ES2022"`, `moduleResolution: "bundler"`
- `vitest-tsconfig-paths` replaced with `vite-tsconfig-paths` (ESM compatible)

## Consequences

- `moduleResolution: "bundler"` is stricter than `"node"` — doesn't allow deep internal imports (e.g., `langchain/dist/...`, `@hyzyla/pdfium/dist/...`)
- Any new scripts that need CJS must use `.cjs` extension
- `async_hooks` and `module` added to Node protocol replacements in webpack config
- `dns` and `module` added to client-side webpack fallbacks (set to `false`)
- Storybook was removed during this migration; leftover `.stories` files cleaned up
