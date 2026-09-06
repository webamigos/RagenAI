import base from '@ragenai/eslint-config';

/**
 * The base entry point, not `/next`: this is a Docusaurus site, and `/next`
 * pulls in `eslint-config-next`, whose rules assume a Next app router and
 * would report on a project that has neither.
 */
export default [
  ...base,
  { ignores: ['.docusaurus/**', 'build/**'] },
  {
    // The screenshot capture script is tooling, not site code. It prints its
    // progress because a run that silently produces nothing is the worst way
    // to spend a Playwright session — same reasoning as apps/admin's e2e
    // exemption.
    files: ['screenshots/**/*.{ts,mts}'],
    rules: {
      'no-console': 'off',
    },
  },
];
