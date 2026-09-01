// @ts-check
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import node from '@ragenai/eslint-config/node';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'src/generated/**'],
  },
  // Shared repo rules — curly, no-console, no-nested-ternary and the rest.
  ...node,
  // This app goes further than the shared base: type-aware linting, and
  // Prettier run as a lint rule rather than only used to switch conflicts off.
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'src/prisma/prisma.service.ts',
      'src/common/guards/api-key.guard.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Ported RAG-engine code (see docs/adrs/21-monorepo-and-api-decoupling.md,
    // Phase B libs-only step) was written against ragen-app's less strict
    // (non-type-aware) Next.js eslint config — untyped `fetch`/`response.json()`
    // JSON payloads, third-party client `.rpc()`/mock `.mock.calls[n][n]`
    // chains, etc. are all genuinely `any` at the type level there too; this
    // app's `recommendedTypeChecked` config just surfaces it. Same rationale
    // as the prisma.service.ts/api-key.guard.ts override above — relax
    // type-aware "unsafe" rules here rather than hand-annotate every external
    // response shape in code that isn't wired into any controller yet.
    files: [
      'src/ai-usage/**/*.ts',
      'src/llm/**/*.ts',
      'src/litellm/**/*.ts',
      'src/vector-store/**/*.ts',
      'src/reranker/**/*.ts',
      'src/chains/**/*.ts',
      'src/organizations/**/*.ts',
      'src/teams/**/*.ts',
      'src/documents/**/*.ts',
      'src/api-limits/**/*.ts',
      'src/mcp/**/*.ts',
      'src/ragen-vault/**/*.ts',
      'src/security/**/*.ts',
      'src/connectors/**/*.ts',
      'src/projects/**/*.ts',
      'src/crypto/**/*.ts',
      'src/threads/persist-api-thread.service.ts',
      'src/threads/persist-api-thread.service.spec.ts',
      'src/messages/**/*.ts',
      'src/audit-logs/**/*.ts',
      'src/subscriptions/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // Bootstrap files: OpenTelemetry and Nest's bootstrap both run before the
    // app logger exists, and a silent failure there is the hardest kind to
    // diagnose. Same exemption apps/web and apps/worker make.
    files: ['src/instrument.ts', 'src/main.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // key-provider/local-provider.ts implements the async KeyProvider
    // interface synchronously (no external I/O — it's a local AES wrap/
    // unwrap) — same "ported against a less strict config" rationale as
    // above, just a different rule than that group needs.
    files: ['src/crypto/key-provider/local-provider.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
);
