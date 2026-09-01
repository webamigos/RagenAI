/**
 * ESLint 9 resolves `eslint.config.*` from the working directory, not from the
 * file being linted, so a single root invocation cannot pick up each
 * workspace's own config. `npm exec --workspace=<name>` runs with that
 * workspace as the cwd, which is what makes the per-app configs apply.
 *
 * Before this, only `apps/web` was linted on commit — api and worker had
 * configs but no hook, and admin, docs and packages/* had neither.
 */
const workspaces = {
  'apps/web': '@webamigos/ragen-web',
  'apps/admin': '@webamigos/ragen-admin',
  'apps/api': '@webamigos/ragen-api',
  'apps/worker': '@webamigos/ragen-worker',
  'packages/observability': '@ragenai/observability',
  'packages/rag-core': '@ragenai/rag-core',
  'packages/storage': '@ragenai/storage',
  'packages/vault-client': '@ragenai/vault-client',
};

const lintByWorkspace = Object.fromEntries(
  Object.entries(workspaces).map(([dir, name]) => [
    `${dir}/**/*.{js,jsx,ts,tsx,mjs,cjs}`,
    (files) =>
      `npm exec --workspace=${name} -- eslint --fix --no-warn-ignored ${files
        .map((f) => JSON.stringify(f))
        .join(' ')}`,
  ]),
);

export default {
  ...lintByWorkspace,
  '*.{json,js,ts,jsx,tsx,html}': ['prettier --write --ignore-unknown'],
};
