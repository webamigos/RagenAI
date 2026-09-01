import globals from 'globals';
import base from './base.js';

/**
 * For the server-side workspaces: `apps/api`, `apps/worker` and `packages/*`.
 *
 * Only globals separate this from the base — the shared rules already suit
 * Node code. Type-aware rules are deliberately not enabled here: they need a
 * `projectService`, which each app configures for itself if it wants them
 * (apps/api does).
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
