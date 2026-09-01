import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import base from './base.js';

/**
 * For the two Next apps, `apps/web` and `apps/admin`.
 *
 * `eslint-config-next/core-web-vitals` is the flat-config entry point, and it
 * still carries the react, react-hooks, import and jsx-a11y plugins that the
 * old eslintrc `extends: ["next/core-web-vitals"]` pulled in — using the bare
 * `@next/eslint-plugin-next` instead would have quietly dropped all of them.
 */
export default [
  ...base,
  ...nextCoreWebVitals,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      /**
       * `eslint-plugin-react-hooks` 7 ships the React Compiler rule set, which
       * did not exist in the 4.6 this repo was pinned to. It reports ~123 sites
       * in apps/web alone — none of them regressions, all of them pre-existing
       * patterns the old plugin never looked at, and several of them arguable
       * (`set-state-in-effect` flags the standard `mounted` hydration guard).
       *
       * Warnings, not errors: visible and actionable, without turning a config
       * consolidation into a React refactor. Promote them per-rule as the
       * findings get worked through.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',

      /**
       * Same reasoning: `@ts-ignore` comments predate any rule against them,
       * and rewriting twelve of them as documented `@ts-expect-error` is a
       * separate pass. The server workspaces keep this as an error.
       */
      '@typescript-eslint/ban-ts-comment': 'warn',

      // Tree-shaking rules that apps/web has enforced since before this package
      // existed; they apply just as well to apps/admin.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportDeclaration[source.value='@headlessui/react'] ImportNamespaceSpecifier",
          message:
            'Do not use `import *` from @headlessui/react. Use named imports for proper tree-shaking.',
        },
        {
          selector: 'ExportAllDeclaration:not([exported])',
          message:
            "Do not use `export * from './module'`. Use explicit named re-exports for better tree-shaking.",
        },
      ],
    },
  },
  // Last word, so nothing the Next config enabled fights the formatter.
  prettier,
];
