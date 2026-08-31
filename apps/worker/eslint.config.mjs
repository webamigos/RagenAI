import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/*']),
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts}'],
    rules: {
      'no-console': 'error',
    },
  },
]);
