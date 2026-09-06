/**
 * ESLint 9 resolves `eslint.config.*` from the working directory, not from the
 * file being linted, so a single root invocation cannot pick up each
 * workspace's own config. `npm exec --workspace=<name>` runs with that
 * workspace as the cwd, which is what makes the per-app configs apply.
 *
 * Before this, only `apps/web` was linted on commit — api and worker had
 * configs but no hook, and admin, docs and packages/* had neither.
 *
 * **Every workspace with an `eslint.config.*` belongs in this map.** Four were
 * missing after it was written, because a workspace added later only lands
 * here if whoever added it remembers this file: `packages/env`,
 * `packages/platform-contracts` and `packages/litellm-client` were linted by
 * `turbo run lint` in CI but not on commit, and `apps/docs` and `packages/db`
 * had no ESLint config at all, so nothing linted them anywhere.
 *
 * `tests/architecture/lint-staged-covers-every-workspace.test.ts` now derives
 * the expected set from the filesystem and fails when the two disagree, which
 * is the only thing that makes this list stay correct.
 */
const workspaces = {
  'apps/web': '@webamigos/ragen-web',
  'apps/admin': '@webamigos/ragen-admin',
  'apps/api': '@webamigos/ragen-api',
  'apps/docs': '@webamigos/ragen-docs',
  'apps/worker': '@webamigos/ragen-worker',
  'apps/mcp': '@webamigos/ragen-mcp',
  'packages/db': '@ragenai/db',
  'packages/env': '@ragenai/env',
  'packages/litellm-client': '@ragenai/litellm-client',
  'packages/observability': '@ragenai/observability',
  'packages/platform-contracts': '@ragenai/platform-contracts',
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

/**
 * Prettier runs on every workspace, not per-workspace: lint-staged matches
 * with `matchBase`, so a bare `*.ts` here matches at any depth.
 *
 * `.mjs`/`.cjs` join the list because every config file in the repository is
 * one — including this file — and none was being formatted. All 20 of them
 * already satisfy prettier, so this costs nothing today and stops the drift
 * that `apps/docs/src/pages/index.tsx` accumulated.
 *
 * `.md`, `.yml` and `.css` are deliberately still absent. 98 of the 136
 * tracked markdown files currently fail `prettier --check`, so adding them
 * would rewrite most of the documentation — AGENTS.md and every ADR included —
 * as a side effect of an unrelated commit. That is a decision worth taking on
 * its own, not one to smuggle in through a hook.
 */
export default {
  ...lintByWorkspace,
  '*.{json,js,ts,jsx,tsx,html,mjs,cjs}': ['prettier --write --ignore-unknown'],
};
