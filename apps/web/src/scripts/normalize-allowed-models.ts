/* eslint-disable no-console */
/**
 * Repair `allowedModels` values that are not LiteLLM model IDs.
 *
 * `apps/admin`'s Models page once offered provider-prefixed, differently
 * spelled IDs (`openai/gpt-5.3-chat`, `anthropic/claude-sonnet-4.6`) while
 * `getAvailableModelsForOrganization()` filters LiteLLM's own IDs
 * (`gpt-5.3-chat`, `claude-sonnet-4-6`) against the stored list. A value that
 * matches nothing does not narrow the list, it empties it — so any
 * organization restricted from that page currently has NO selectable model.
 *
 * The page now derives its options from `src/libs/llm/model-registry.ts`
 * (`apps/admin/.../models/models-config.ts`) and rejects unknown values on
 * write, but that only protects new saves. Rows already stored stay broken
 * until this runs.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/normalize-allowed-models.ts --dry-run
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/normalize-allowed-models.ts --apply
 *
 * What it does to each unrecognised value:
 *   - strips a provider prefix and matches the registry case-insensitively,
 *     also trying `.` → `-` (`claude-sonnet-4.6` → `claude-sonnet-4-6`);
 *   - drops it if nothing matches. A dropped value is not a lost restriction:
 *     it restricted nothing, it broke everything. An allowlist that ends up
 *     empty means "no restriction", which is the pre-restriction state and
 *     strictly better than an organization that can use no model at all —
 *     re-apply the intended restriction from the admin panel afterwards, and
 *     the `--apply` output names every organization that needs it.
 *
 * Idempotent: a row already holding only valid IDs is left alone.
 *
 * Self-contained: imports the generated Prisma client directly (same pattern
 * as dedupe-subscriptions.ts) so it doesn't pull webpack-only modules under
 * tsx.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { MODEL_REGISTRY } from '../libs/llm/model-registry';

const DEFAULT_ALLOWED_MODELS_KEY = 'default_allowed_models';

const VALID = new Set(Object.keys(MODEL_REGISTRY));

/** Registry IDs by a normalised form, so lookup tolerates case and `.`/`-`. */
const BY_NORMALISED = new Map(
  Object.keys(MODEL_REGISTRY).map((id) => [normalise(id), id]),
);

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, '-');
}

/**
 * Resolve one stored value to a real LiteLLM model ID, or null if it cannot
 * be rescued. Exported shape kept simple on purpose: the caller reports.
 */
function resolve(value: string): string | null {
  if (VALID.has(value)) {
    return value;
  }

  // `openai/gpt-5.3-chat` → `gpt-5.3-chat`. Take the last segment: LiteLLM
  // model IDs never contain a slash.
  const withoutPrefix = value.includes('/')
    ? value.slice(value.lastIndexOf('/') + 1)
    : value;

  if (VALID.has(withoutPrefix)) {
    return withoutPrefix;
  }

  return BY_NORMALISED.get(normalise(withoutPrefix)) ?? null;
}

type Repair = {
  label: string;
  before: string[];
  after: string[];
  rescued: [string, string][];
  dropped: string[];
};

function planRepair(label: string, before: string[]): Repair | null {
  const after: string[] = [];
  const rescued: [string, string][] = [];
  const dropped: string[] = [];

  for (const value of before) {
    const resolved = resolve(value);
    if (resolved === null) {
      dropped.push(value);
      continue;
    }
    if (resolved !== value) {
      rescued.push([value, resolved]);
    }
    if (!after.includes(resolved)) {
      after.push(resolved);
    }
  }

  const unchanged =
    after.length === before.length && after.every((v, i) => v === before[i]);

  return unchanged ? null : { label, before, after, rescued, dropped };
}

function report(repair: Repair): void {
  console.log(`\n  ${repair.label}`);
  console.log(`    before: ${JSON.stringify(repair.before)}`);
  console.log(`    after:  ${JSON.stringify(repair.after)}`);
  for (const [from, to] of repair.rescued) {
    console.log(`    fixed:   ${from} → ${to}`);
  }
  for (const value of repair.dropped) {
    console.log(`    dropped: ${value} (no such model)`);
  }
  if (repair.after.length === 0) {
    console.log(
      '    NOTE: allowlist is now empty — this organization has no model',
    );
    console.log(
      '          restriction. Re-apply the intended one from the admin panel.',
    );
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    console.log(
      dryRun
        ? 'Dry run — nothing will be written. Re-run with --apply to fix.'
        : 'Applying repairs.',
    );

    // --- Per-organization allowlists ---
    const settings = await prisma.organizationSettings.findMany({
      where: { allowedModels: { isEmpty: false } },
      select: {
        organizationId: true,
        allowedModels: true,
        organization: { select: { name: true } },
      },
    });

    console.log(
      `\n${settings.length} organization(s) with a non-empty allowlist.`,
    );

    const orgRepairs = settings
      .map((row) =>
        planRepair(
          `${row.organization?.name ?? 'unknown'} (${row.organizationId})`,
          row.allowedModels,
        ),
      )
      .filter((r): r is Repair => r !== null);

    if (orgRepairs.length === 0) {
      console.log('  All allowlists already hold valid LiteLLM model IDs.');
    }

    for (const repair of orgRepairs) {
      report(repair);
    }

    // --- Platform default (applied to newly created organizations) ---
    const defaultsRow = await prisma.settings.findUnique({
      where: { key: DEFAULT_ALLOWED_MODELS_KEY },
    });

    let defaultsRepair: Repair | null = null;
    if (defaultsRow) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(defaultsRow.value);
      } catch {
        parsed = null;
      }
      const before = Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string')
        : [];

      if (before.length > 0) {
        defaultsRepair = planRepair(
          `Settings.${DEFAULT_ALLOWED_MODELS_KEY}`,
          before,
        );
      }
    }

    console.log('\nPlatform default allowlist:');
    if (!defaultsRepair) {
      console.log('  Nothing to fix.');
    } else {
      report(defaultsRepair);
    }

    if (dryRun) {
      console.log(
        `\nWould fix ${orgRepairs.length} organization(s)${
          defaultsRepair ? ' and the platform default' : ''
        }.`,
      );
      return;
    }

    for (const repair of orgRepairs) {
      await prisma.organizationSettings.update({
        where: { organizationId: repair.organizationId! },
        data: { allowedModels: repair.after },
      });
    }

    if (defaultsRepair) {
      await prisma.settings.update({
        where: { key: DEFAULT_ALLOWED_MODELS_KEY },
        data: { value: JSON.stringify(defaultsRepair.after) },
      });
    }

    console.log(
      `\nFixed ${orgRepairs.length} organization(s)${
        defaultsRepair ? ' and the platform default' : ''
      }.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
