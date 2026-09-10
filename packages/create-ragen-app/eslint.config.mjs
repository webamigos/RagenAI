import node from '@ragenai/eslint-config/node';

export default [
  ...node,
  { ignores: ['dist/**'] },
  {
    // This package is a user-facing CLI with no logger dependency of its own
    // (it must stay self-contained for a standalone npm publish) — printing
    // straight to the console is the point, unlike the services `node`
    // targets, which use Pino.
    files: ['src/index.ts'],
    rules: { 'no-console': 'off' },
  },
];
