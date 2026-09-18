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
 * What the install actually runs on — a set of ranges, not a floor, and both
 * the patch digit and the gap are load-bearing.
 *
 * A bare major used to be enough, and stopped being enough when a transitive
 * dependency narrowed its own range mid-line. `jsdom@30.0.1` requires
 * `^22.22.2 || ^24.15.0 || >=26.0.0`, and the repository sets
 * `engine-strict=true`, so npm *stops* on a mismatch rather than warning.
 * Two consequences, and only the first was obvious:
 *
 * - **Node 24.0–24.14 fail `npm install`.** The old `>=24` check waved them
 *   through, so someone on 24.13 got a cloned tree, a written `.env.local`, a
 *   running docker compose, and then EBADENGINE.
 * - **Node 25 fails too, and a floor cannot say that.** `>=24.15.0` accepts
 *   25.x, which that range skips entirely. Odd-numbered Node lines are never
 *   LTS and libraries routinely omit them, so the gap is normal rather than an
 *   oversight — and a single minimum version cannot express it.
 *
 * Node 22 is inside jsdom's range and deliberately *not* here: the repository
 * has required 24 since long before this, and widening support is a decision,
 * not a consequence of a dependency's range.
 *
 * Kept in step with `engines.node` across the root and every workspace by
 * `tests/architecture/the-node-floor-is-one-number.test.ts`, with this
 * package's own `engines` by `src/__tests__/node-version.test.ts`, and proved
 * against real Nodes by `.github/workflows/installer.yml`, which pins 24.14
 * (must refuse), 25 (must refuse) and 24.15 (must scaffold).
 */
export const SUPPORTED_NODE_RANGES = [
  { from: '24.15.0', belowMajor: 25 },
  { from: '26.0.0' },
] as const;

/** The oldest Node the install accepts — the first range's start. */
export const REQUIRED_NODE_VERSION = SUPPORTED_NODE_RANGES[0].from;

/**
 * The same thing in the notation `engines.node` uses, so one constant can be
 * compared against twenty-one manifests instead of being retyped into them.
 */
export const SUPPORTED_NODE_ENGINES_RANGE = SUPPORTED_NODE_RANGES.map(
  (range) => ('belowMajor' in range ? `^${range.from}` : `>=${range.from}`),
).join(' || ');

/**
 * Why the range is shaped the way it is. Named in the refusal, because
 * "you need 24.15" read by someone who *has* Node 24 is a riddle, not an
 * instruction — and "you need 24.15 or newer" read by someone on Node 25 is
 * simply wrong.
 */
const REQUIRED_NODE_REASON =
  'jsdom, a transitive dependency, requires ^22.22.2 || ^24.15.0 || >=26.0.0, and this repository sets engine-strict=true — so npm stops rather than warns.';

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
 * an unexpected format cannot be read as unsupported and block an install that
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

/**
 * Whether a version falls inside any supported range.
 *
 * A range with `belowMajor` is closed at that major (`^24.15.0`); one without
 * is open above (`>=26.0.0`). An unparseable range entry cannot happen — the
 * table is a literal in this file — but it fails *open* if it ever does,
 * matching `parseNodeVersion`.
 */
export function isSupportedNodeVersion(version: NodeVersion): boolean {
  return SUPPORTED_NODE_RANGES.some((range) => {
    const from = parseNodeVersion(range.from);
    if (!from) {
      return true;
    }
    if (compareNodeVersions(version, from) < 0) {
      return false;
    }
    return !('belowMajor' in range) || version.major < range.belowMajor;
  });
}

/**
 * A line the caller can paste. `nvm install`, not `nvm use`: someone in this
 * position usually has *some* Node of that major already, and `nvm use 24`
 * would select exactly the one that does not work.
 */
const REMEDY = `  nvm install ${REQUIRED_NODE_VERSION}   # or fnm, volta, asdf, …`;

/**
 * Whether this Node is below every supported range, or inside a gap between
 * two of them. The distinction is the whole message: "too old" is actionable
 * and "unsupported release line" is a different instruction.
 */
function describeUnsupported(version: NodeVersion): string {
  const floor = parseNodeVersion(REQUIRED_NODE_VERSION);
  const tooOld = floor ? compareNodeVersions(version, floor) < 0 : false;
  const current = formatNodeVersion(version);

  if (tooOld) {
    return `A Ragen installation needs Node ${SUPPORTED_NODE_ENGINES_RANGE}, and this is Node ${current}.`;
  }

  return `Node ${current} is newer than the minimum and still not supported: a Ragen installation needs ${SUPPORTED_NODE_ENGINES_RANGE}, which skips the ${version.major}.x line. Odd-numbered Node lines never become LTS, and libraries routinely omit them.`;
}

export function checkNodeVersion({
  version,
  willRunSetup,
}: NodeVersionCheck): NodeVersionVerdict {
  const current = parseNodeVersion(version);

  if (current === undefined || isSupportedNodeVersion(current)) {
    return { kind: 'ok' };
  }

  const headline = describeUnsupported(current);

  if (!willRunSetup) {
    return {
      kind: 'warn',
      message: [
        headline,
        REQUIRED_NODE_REASON,
        'Nothing is being installed here, so the files will be written anyway —',
        'but switch before running npm install or the app in the new directory.',
      ].join(' '),
    };
  }

  return {
    kind: 'refuse',
    message: [
      headline,
      '',
      // The reason comes second and in full, because the interesting cases are
      // someone who already has the right major and someone on a *newer* Node,
      // both of whom read the line above as nonsense without it.
      `Why: ${REQUIRED_NODE_REASON}`,
      'On this Node, npm install fails with EBADENGINE partway through the',
      'setup below.',
      '',
      'Stopping before anything is written: the setup this runs for you —',
      'npm install, prisma generate, migrate and seed — would run under this',
      'Node and leave a tree that fails later, somewhere that does not point',
      'back here.',
      '',
      REMEDY,
      '',
      'Or pass --skip-install to write the files now and run the setup',
      'yourself on a supported Node.',
    ].join('\n'),
  };
}
