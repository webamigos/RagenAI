/**
 * Does the panel agree with the environment about what is being enforced?
 *
 *   npm run guardrails:preflight
 *
 * Run it against the environment a service will actually get, on each service,
 * **before** the Phase B deploy. Phase B moves moderation from an environment
 * variable to a row an operator can see. Between those two worlds there is one
 * way to lose protection without anyone noticing: an installation running with
 * `MODERATION_ENABLED=1` today, whose `content-moderation` rule is still
 * disabled in the panel — because that is the creation default, and because
 * Phase A shipped the rules switched off on purpose.
 *
 * Deploy B3 in that state and moderation stops. Nothing errors. The chat keeps
 * answering, the panel keeps listing the rule, and the only evidence is an
 * absence. So this script exits non-zero while the two disagree, and says
 * which way to reconcile them.
 *
 * It reads the database rather than guessing, because "what the panel says" is
 * a row, not a configuration file — and the whole point of the phase is that
 * those are no longer the same thing.
 */
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';

import { guardrailsDisabled } from '@ragenai/env';
import { PrismaClient } from '../apps/web/src/generated/prisma/client.js';

/** The built-in whose environment counterpart this phase retires. */
type BuiltIn = {
  readonly key: string;
  /** The variable that decides it today, before B3. */
  readonly variable: string;
  /** Whether that variable currently says "on". */
  readonly envEnabled: boolean;
};

/**
 * The same truthiness the runtime uses, restated rather than imported.
 *
 * `jailbreak-classifier.ts` accepts `1`, `true`, `yes`; `shouldModerate()`
 * accepts only `1`. A preflight that applied one rule to both would report a
 * disagreement that does not exist, or miss one that does — so each variable
 * is read the way the code that reads it today reads it, and that is the point
 * of the script rather than a detail of it.
 */
export function environmentSaysEnabled(
  env: NodeJS.ProcessEnv,
): readonly BuiltIn[] {
  const moderation = env.MODERATION_ENABLED === '1';

  const jailbreakRaw = env.JAILBREAK_DETECTION_ENABLED?.trim().toLowerCase();
  const jailbreak =
    jailbreakRaw === '1' || jailbreakRaw === 'true' || jailbreakRaw === 'yes';

  return [
    {
      key: 'content-moderation',
      variable: 'MODERATION_ENABLED',
      envEnabled: moderation,
    },
    {
      key: 'jailbreak-detection',
      variable: 'JAILBREAK_DETECTION_ENABLED',
      envEnabled: jailbreak,
    },
  ];
}

export type Disagreement = {
  readonly key: string;
  readonly variable: string;
  readonly envEnabled: boolean;
  readonly ruleEnabled: boolean;
  readonly reconcile: string;
};

/**
 * Compare the two worlds, and say which way to reconcile each difference.
 *
 * Only one direction is dangerous. Environment on, rule off is **lost
 * protection** the moment B3 deploys, and it is silent. Rule on, environment
 * off is the opposite: the operator has already written down what they want
 * and B3 will start doing it — worth printing, because it is a change in
 * behaviour nobody may be expecting, but it is not a regression.
 */
export function disagreements(
  builtIns: readonly BuiltIn[],
  ruleEnabledByKey: ReadonlyMap<string, boolean>,
): readonly Disagreement[] {
  const out: Disagreement[] = [];

  for (const builtIn of builtIns) {
    // A missing row is not "disabled" — it is an installation whose seed did
    // not run, and reporting it as a mere difference would hide that. It is
    // reported as `false` here and named separately by `missingRules`.
    const ruleEnabled = ruleEnabledByKey.get(builtIn.key) === true;
    if (ruleEnabled === builtIn.envEnabled) {
      continue;
    }

    out.push({
      key: builtIn.key,
      variable: builtIn.variable,
      envEnabled: builtIn.envEnabled,
      ruleEnabled,
      reconcile: builtIn.envEnabled
        ? `Enable "${builtIn.key}" in the admin panel before deploying, or this stops being enforced.`
        : `"${builtIn.key}" is enabled in the panel and ${builtIn.variable} is not set. Phase B will start enforcing it.`,
    });
  }

  return out;
}

/** Built-ins the database has no row for at all. */
export function missingRules(
  builtIns: readonly BuiltIn[],
  ruleEnabledByKey: ReadonlyMap<string, boolean>,
): readonly string[] {
  return builtIns.filter((b) => !ruleEnabledByKey.has(b.key)).map((b) => b.key);
}

async function readPlatformRules(): Promise<Map<string, boolean>> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — nothing to compare against.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const rows = await prisma.guardrail.findMany({
      where: { organizationId: null, key: { not: null } },
      select: { key: true, enabled: true },
    });
    return new Map(
      rows.flatMap((row) => (row.key ? [[row.key, row.enabled] as const] : [])),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  // Said first, because it makes everything below moot. A service started with
  // the break-glass set evaluates nothing, whatever the panel holds.
  const broken = guardrailsDisabled(process.env);
  if (broken) {
    console.log(
      'GUARDRAILS_DISABLED is set: this service will evaluate no rules at all.',
    );
    console.log(
      'That is the break-glass, not a configuration — unset it once the incident is over.\n',
    );
  }

  const builtIns = environmentSaysEnabled(process.env);
  const rules = await readPlatformRules();

  // Widths from the content, not guessed: `JAILBREAK_DETECTION_ENABLED=off`
  // is 31 characters and overran a hand-picked 22, which pushed the third
  // column out of line on exactly the row an operator is scanning for.
  const environmentCell = (builtIn: BuiltIn) =>
    `${builtIn.variable}=${builtIn.envEnabled ? 'on' : 'off'}`;
  const keyWidth = Math.max(8, ...builtIns.map((b) => b.key.length));
  const envWidth = Math.max(
    11,
    ...builtIns.map((b) => environmentCell(b).length),
  );

  console.log(
    `  ${'built-in'.padEnd(keyWidth)}  ${'environment'.padEnd(envWidth)}  panel`,
  );
  for (const builtIn of builtIns) {
    const inPanel = rules.has(builtIn.key)
      ? rules.get(builtIn.key)
        ? 'enabled'
        : 'disabled'
      : 'NO ROW';
    console.log(
      `  ${builtIn.key.padEnd(keyWidth)}  ${environmentCell(builtIn).padEnd(envWidth)}  ${inPanel}`,
    );
  }
  console.log();

  // Everything is reported before anything returns. The first version exited
  // on a missing row, so a database that was both unseeded *and* about to lose
  // moderation reported one problem, took a fix, and only then mentioned the
  // other — two round trips on a check whose whole purpose is to say what is
  // wrong before a deploy, not after one.
  const missing = missingRules(builtIns, rules);
  const differences = disagreements(builtIns, rules);
  const losesProtection = differences.filter((d) => d.envEnabled);

  for (const difference of differences) {
    console.log(
      `  ${difference.envEnabled ? 'BLOCK' : 'note '}  ${difference.reconcile}`,
    );
  }

  if (missing.length > 0) {
    console.error(
      `  BLOCK  No platform rule exists for: ${missing.join(', ')}. The guardrails seed has not run against this database.`,
    );
  }

  // The break-glass makes the reconciliation advice unactionable rather than
  // wrong: with it set, enabling a rule in the panel changes nothing, because
  // the service will evaluate none of them. Blocking the deploy on advice the
  // operator cannot act on is worse than saying what is actually true.
  if (broken) {
    console.log(
      '\nNot blocking: GUARDRAILS_DISABLED is set, so no rule will be enforced' +
        ' after this deploy either. Reconcile the rows above before you unset it.',
    );
    return;
  }

  if (missing.length > 0 || losesProtection.length > 0) {
    console.error(
      `\n${losesProtection.length} protection(s) this service enforces today would stop at the Phase B deploy.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    differences.length > 0
      ? '\nNothing would stop being enforced. The notes above are changes the panel already asks for.'
      : '\nThe panel and the environment agree. Safe to deploy Phase B to this service.',
  );
}

/**
 * Only when run as a command, so the test can import the pure halves without
 * opening a database connection to whatever `DATABASE_URL` happens to hold.
 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
