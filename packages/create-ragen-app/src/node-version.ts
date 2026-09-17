/**
 * Whether this Node can be used to create a Ragen installation.
 *
 * The distinction that matters: **the installation** needs a recent Node, not
 * this CLI. The CLI itself runs happily on older majors — it was published and
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
 *   since the scaffolded app still needs a supported Node to start
 *
 * `--yes` deliberately does not bypass it. That flag means "accept the
 * defaults", not "ignore a requirement".
 */

/**
 * The floor is a full version, not a major, and the patch digit is load-bearing.
 *
 * A major alone used to be enough, and stopped being enough the moment a
 * transitive dependency narrowed its own range mid-line: `jsdom@30.0.1`
 * requires `^22.22.2 || ^24.15.0 || >=26.0.0`. The repository sets
 * `engine-strict=true`, so npm *stops* on that mismatch rather than warning —
 * which means every Node 24.0–24.14 fails `npm install`, and the wizard's own
 * `>=24` check waved them through. Someone on 24.13 got a cloned tree, a
 * written `.env.local`, a running docker compose, and then EBADENGINE.
 *
 * Kept in step with this package's `engines.node` by
 * `src/__tests__/node-version.test.ts`, and with the repository's own Node
 * version documented in AGENTS.md and `.nvmrc`.
 */
export const REQUIRED_NODE_VERSION = '24.15.0';

/**
 * Why the floor is where it is. Named in the refusal, because "you need
 * 24.15" read by someone who *has* Node 24 is a riddle, not an instruction.
 */
const REQUIRED_NODE_REASON =
  'jsdom, a transitive dependency, requires ^24.15.0, and this repository sets engine-strict=true — so npm stops rather than warns.';

export type NodeVersionVerdict =
  | { kind: 'ok' }
  | { kind: 'warn'; message: string }
  | { kind: 'refuse'; message: string };

export interface NodeVersionCheck {
  /** As `process.version` gives it, e.g. `v24.13.0`. */
  version: string;
  /** False when `--skip-install` means the wizard runs nothing itself. */
  willRunSetup: boolean;
}

export interface NodeVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Returns undefined for anything that is not a recognisable Node version, so
 * an unexpected format cannot be read as "too old" and block an install that
 * would have worked. A version missing its patch digit counts as unreadable
 * for the same reason: guessing `.0` would refuse a release that may be fine.
 */
export function parseNodeVersion(version: string): NodeVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function formatNodeVersion({
  major,
  minor,
  patch,
}: NodeVersion): string {
  return `${major}.${minor}.${patch}`;
}

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. */
function compareNodeVersions(a: NodeVersion, b: NodeVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function checkNodeVersion({
  version,
  willRunSetup,
}: NodeVersionCheck): NodeVersionVerdict {
  const current = parseNodeVersion(version);
  // Parsed rather than spelled out twice: the constant is the single statement
  // of the floor, and this cannot drift from it.
  const required = parseNodeVersion(REQUIRED_NODE_VERSION);

  if (
    current === undefined ||
    required === undefined ||
    compareNodeVersions(current, required) >= 0
  ) {
    return { kind: 'ok' };
  }

  const currentText = formatNodeVersion(current);

  if (!willRunSetup) {
    return {
      kind: 'warn',
      message: [
        `You are on Node ${currentText}, and a Ragen installation needs Node ${REQUIRED_NODE_VERSION} or newer.`,
        `That is a patch version, not just a major — ${REQUIRED_NODE_REASON}`,
        'Nothing is being installed here, so the files will be written anyway —',
        'but switch before running npm install or the app in the new directory.',
      ].join(' '),
    };
  }

  return {
    kind: 'refuse',
    message: [
      `A Ragen installation needs Node ${REQUIRED_NODE_VERSION} or newer, and this is Node ${currentText}.`,
      '',
      // The reason comes second and in full, because the interesting case is
      // someone who already has the right major and reads the line above as
      // nonsense.
      `Yes, the patch digit: ${REQUIRED_NODE_REASON}`,
      `On Node ${currentText}, npm install fails with EBADENGINE partway through`,
      'the setup below.',
      '',
      'Stopping before anything is written: the setup this runs for you —',
      'npm install, prisma generate, migrate and seed — would run under this',
      'Node and leave a tree that fails later, somewhere that does not point',
      'back here.',
      '',
      // `nvm install`, not `nvm use`: someone in this position usually has an
      // older 24 installed, and `nvm use 24` would select exactly that.
      `  nvm install ${REQUIRED_NODE_VERSION}   # or fnm, volta, asdf, …`,
      '',
      'Or pass --skip-install to write the files now and run the setup',
      'yourself on a supported Node.',
    ].join('\n'),
  };
}
