/* eslint-disable no-console */
/**
 * Migration script: for each Ragen org without any Better Auth team,
 * create a default "General" team, move every org member into it, and
 * provision its LiteLLM team + virtual key.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx \
 *     src/scripts/backfill-teams-for-orgs.ts
 *
 * Idempotent: safe to re-run. Orgs that already have one or more teams
 * are skipped. The default team gets a stable id `{orgId}-general` so
 * a partial second run does not create duplicates.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';
import { provisionLiteLLMForTeamCommand } from '../features/teams/services/commands/provision-litellm-team-command';

const DEFAULT_TEAM_NAME = 'General';

async function main() {
  const connectionString =
    process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL or DATABASE_DIRECT_URL is required');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Scanning ${orgs.length} organizations`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const org of orgs) {
      try {
        const teamCount = await prisma.team.count({
          where: { organizationId: org.id },
        });
        if (teamCount > 0) {
          skipped += 1;
          continue;
        }

        const teamId = `${org.id}-general`;

        await prisma.team.upsert({
          where: { id: teamId },
          update: {},
          create: {
            id: teamId,
            name: DEFAULT_TEAM_NAME,
            organizationId: org.id,
          },
        });

        const members = await prisma.member.findMany({
          where: { organizationId: org.id },
          select: { userId: true },
        });

        for (const member of members) {
          const existingTm = await prisma.teamMember.findFirst({
            where: { teamId, userId: member.userId },
            select: { id: true },
          });
          if (existingTm) {
            continue;
          }
          await prisma.teamMember.create({
            data: {
              id: crypto.randomUUID(),
              teamId,
              userId: member.userId,
            },
          });
        }

        await provisionLiteLLMForTeamCommand({ teamId });

        console.log(
          `  [${org.slug ?? org.id}] created ${DEFAULT_TEAM_NAME} with ${members.length} members`,
        );
        created += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  [${org.slug ?? org.id}] failed: ${message}`);
      }
    }

    console.log(
      `\nBackfill complete: ${created} created, ${skipped} skipped, ${failed} failed`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
