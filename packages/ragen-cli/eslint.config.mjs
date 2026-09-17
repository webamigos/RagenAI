import node from '@ragenai/eslint-config/node';

export default [
  ...node,
  { ignores: ['dist/**'] },
  {
    // Same exemption as packages/create-ragen-app: this is a user-facing CLI
    // with no logger of its own — it must stay dependency-free for a
    // standalone npm publish — so printing to the console is the point, not a
    // leftover debug statement.
    files: ['src/index.ts', 'src/create.ts'],
    rules: { 'no-console': 'off' },
  },
];
