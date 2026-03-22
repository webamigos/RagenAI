/* eslint-disable no-console */
/**
 * Migration script: Provision LiteLLM teams for all existing organizations.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx src/scripts/migrate-litellm-teams.ts
 *
 * Idempotent: safe to re-run — skips orgs that already have a team/key.
 */
import db from '@ragenai/prisma-client';
import {
  ensureLiteLLMTeamCommand,
  syncLiteLLMTeamBudgetCommand,
  syncLiteLLMTeamModelsCommand,
} from '@/features/organizations/services/commands/litellm-team-command';

async function main() {
  const prisma = db;

  try {
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    console.log(`Found ${organizations.length} organizations to migrate`);

    let processed = 0;
    let failed = 0;

    for (const org of organizations) {
      try {
        console.log(`Processing org: ${org.name} (${org.id})`);

        // ensureLiteLLMTeamCommand is idempotent — no-op if team + key already exist
        await ensureLiteLLMTeamCommand(org.id, org.name);

        // Always sync budget and models (even for existing teams)
        await syncLiteLLMTeamBudgetCommand(org.id);
        await syncLiteLLMTeamModelsCommand(org.id);

        processed++;
        console.log('  ✓ Done');
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ Failed: ${message}`);
      }
    }

    console.log(
      `\nMigration complete: ${processed} processed, ${failed} failed`,
    );
  } finally {
    // Shared prisma client — no disconnect needed
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
