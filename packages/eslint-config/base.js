import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Paths no app should lint: build output, generated clients, coverage.
 *
 * Kept here rather than in each app because forgetting one is expensive —
 * `prisma generate` alone emits tens of thousands of lines that trip almost
 * every rule, and a single missing entry buries the real findings.
 */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
  '**/*.min.js',
];

/**
 * The rules that apply to every workspace, whatever it runs on.
 *
 * `curly` and the import restrictions come from AGENTS.md's "Key Conventions",
 * which describes them as repository-wide — before this package they were
 * enforced in `apps/web` only, so the other four apps were never held to them.
 */
export const rules = {
  // AGENTS.md: "always use braces for if/else/for/while — no single-line bodies"
  curly: ['error', 'all'],
  'no-console': 'error',
  'no-nested-ternary': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],

  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      varsIgnorePattern: '^_',
      argsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  // Wide swathes of this codebase predate strict typing; `any` is a cleanup
  // task of its own, not something to block every other lint fix on.
  '@typescript-eslint/no-explicit-any': 'off',
};

/**
 * Rules that only make sense on TypeScript sources.
 *
 * Scoping matters: `consistent-type-imports` needs the TypeScript parser, and
 * the Next config applies its own Babel-based parser to `.mjs` files. Left
 * unscoped, the rule crashes ESLint outright on `eslint.config.mjs`.
 */
export const typescriptRules = {
  '@typescript-eslint/consistent-type-imports': [
    'warn',
    {
      prefer: 'type-imports',
      fixStyle: 'inline-type-imports',
      disallowTypeAnnotations: false,
    },
  ],
};

/**
 * Base flat config: TypeScript support plus the shared rules above.
 *
 * `prettier` goes last on purpose — it only turns rules *off*, and it has to
 * see everything the earlier entries turned on to disable the ones that would
 * fight the formatter.
 */
export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules },
  { files: ['**/*.{ts,tsx,mts,cts}'], rules: typescriptRules },
  {
    // Tests print on purpose — a failing spec that explains itself is worth
    // more than a clean console rule.
    files: [
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
