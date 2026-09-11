/**
 * Whether this Node can be used to create a Ragen installation.
 *
 * The distinction that matters: **the installation** needs Node 24, not this
 * CLI. The CLI itself runs happily on older majors — it was published and
 * verified on Node 22 by accident — so refusing on the grounds that "this
 * tool requires Node 24" would be both untrue and unhelpfully broad.
 *
 * What genuinely breaks is the first-run setup the wizard performs on the
 * caller's behalf: `npm install` across the monorepo, `prisma generate`,
 * `migrate deploy` and the seed all run under whatever Node invoked the
 * wizard. Getting a half-built `node_modules` out of that is the expensive
 * failure, because it surfaces much later and nowhere near its cause. npm's
 * own `EBADENGINE` warning does fire, but as one line inside a wall of
 * install output, and it does not say what will break.
 *
 * So the check is gated on what the wizard is about to *do*:
 *
 * - running the setup steps → refuse, before anything is cloned
 * - `--skip-install` → proceed, because nothing runs here; warn instead,
 *   since the scaffolded app still needs Node 24 to start
 *
 * `--yes` deliberately does not bypass it. That flag means "accept the
 * defaults", not "ignore a requirement".
 */

/**
 * Kept in step with this package's `engines.node` by
 * `src/__tests__/node-version.test.ts`, and with the repository's own Node
 * version documented in AGENTS.md ("Node.js 24.x (Active LTS)").
 */
export const REQUIRED_NODE_MAJOR = 24;

export type NodeVersionVerdict =
  | { kind: 'ok' }
  | { kind: 'warn'; message: string }
  | { kind: 'refuse'; message: string };

export interface NodeVersionCheck {
  /** As `process.version` gives it, e.g. `v22.22.3`. */
  version: string;
  /** False when `--skip-install` means the wizard runs nothing itself. */
  willRunSetup: boolean;
}

/**
 * Returns undefined for anything that is not a recognisable Node version, so
 * an unexpected format cannot be read as "too old" and block an install that
 * would have worked.
 */
export function parseNodeMajor(version: string): number | undefined {
  const match = /^v?(\d+)\./.exec(version.trim());
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

export function checkNodeVersion({
  version,
  willRunSetup,
}: NodeVersionCheck): NodeVersionVerdict {
  const major = parseNodeMajor(version);

  if (major === undefined || major >= REQUIRED_NODE_MAJOR) {
    return { kind: 'ok' };
  }

  if (!willRunSetup) {
    return {
      kind: 'warn',
      message: [
        `You are on Node ${major}, and a Ragen installation needs Node ${REQUIRED_NODE_MAJOR}.`,
        'Nothing is being installed here, so the files will be written anyway —',
        'but switch before running npm install or the app in the new directory.',
      ].join(' '),
    };
  }

  return {
    kind: 'refuse',
    message: [
      `A Ragen installation needs Node ${REQUIRED_NODE_MAJOR}, and this is Node ${major}.`,
      '',
      'Stopping before anything is written: the setup this runs for you —',
      'npm install, prisma generate, migrate and seed — would run under this',
      'Node and leave a tree that fails later, somewhere that does not point',
      'back here.',
      '',
      `  nvm use ${REQUIRED_NODE_MAJOR}   # or fnm, volta, asdf, …`,
      '',
      'Or pass --skip-install to write the files now and run the setup',
      'yourself on a supported Node.',
    ].join('\n'),
  };
}
