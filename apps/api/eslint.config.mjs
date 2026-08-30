// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'src/generated/**'],
  },
  eslint.configs.recommended,
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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
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
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);