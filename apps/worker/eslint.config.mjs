import node from '@ragenai/eslint-config/node';

export default [
  ...node,
  {
    // Temporal's generated workflow bundle and the webpack output it produces.
    ignores: ['dist/**'],
  },
];
