import node from '@ragenai/eslint-config/node';

export default [
  ...node,
  {
    ignores: ['dist/**'],
  },
];
