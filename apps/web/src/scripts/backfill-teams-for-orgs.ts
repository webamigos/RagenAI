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
 *
 * Self-contained on purpose: HTTP + crypto + Prisma only, no imports
 * from src/app or src/libs. The shared logger and hashApiKey modules
 * use Webpack-only constructs (CJS `require`, named imports of CJS-only
 * crypto-js) that fail under tsx's native ESM loader.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';
import cryptoJS from 'crypto-js';

const DEFAULT_TEAM_NAME = 'General';
const LITELLM_PROXY_URL =
  process.env.LITELLM_PROXY_URL ?? 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;
const SECRET_KEY = process.env.SECRET_KEY;

function masterKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (LITELLM_MASTER_KEY) {
    headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
  }
  return headers;
}

function encryptApiKey(apiKey: string): string {
  if (!SECRET_KEY) {
    throw new Error('SECRET_KEY env var required to encrypt LiteLLM key token');
  }
  return cryptoJS.AES.encrypt(apiKey, SECRET_KEY).toString();
}

async function getLiteLLMTeamInfo(teamId: string): Promise<unknown | null> {
  const response = await fetch(
    `${LITELLM_PROXY_URL}/team/info?team_id=${encodeURIComponent(teamId)}`,
    { headers: masterKeyHeaders(), signal: AbortSignal.timeout(5000) },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `LiteLLM /team/info ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

async function createLiteLLMTeam(params: {
  teamId: string;
  teamAlias: string;
  maxBudget: number;
  budgetDuration: string | null;
  models: string[];
  tpmLimit: number | null;
  rpmLimit: number | null;
}): Promise<void> {
  const body: Record<string, unknown> = {
    team_id: params.teamId,
    team_alias: params.teamAlias,
    max_budget: params.maxBudget,
  };
  if (params.budgetDuration) {
    body.budget_duration = params.budgetDuration;
  }
  if (params.models.length > 0) {
    body.models = params.models;
  }
  if (params.tpmLimit != null) {
    body.tpm_limit = params.tpmLimit;
  }
  if (params.rpmLimit != null) {
    body.rpm_limit = params.rpmLimit;
  }

  const response = await fetch(`${LITELLM_PROXY_URL}/team/new`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(
      `LiteLLM /team/new ${response.status}: ${await response.text()}`,
    );
  }
}

async function deleteLiteLLMTeam(teamId: string): Promise<void> {
  await fetch(`${LITELLM_PROXY_URL}/team/delete`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({ team_ids: [teamId] }),
    signal: AbortSignal.timeout(5000),
  });
}

async function generateLiteLLMKey(
  teamId: string,
): Promise<{ key: string; token: string }> {
  const response = await fetch(`${LITELLM_PROXY_URL}/key/generate`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({
      team_id: teamId,
      key_alias: `ragen-team-${teamId}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(
      `LiteLLM /key/generate ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as { key: string; token: string };
}

async function deleteLiteLLMKey(keyToken: string): Promise<void> {
  await fetch(`${LITELLM_PROXY_URL}/key/delete`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({ keys: [keyToken] }),
    signal: AbortSignal.timeout(5000),
  });
}

async function provisionLiteLLMForTeam(
  prisma: PrismaClient,
  teamId: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { organization: { select: { name: true, slug: true } } },
  });
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }
  if (team.litellmTeamId && team.litellmKeyToken) {
    return;
  }

  const teamAlias = team.organization.slug
    ? `${team.organization.slug}:${team.name}`
    : team.name;

  const existingRemote = await getLiteLLMTeamInfo(team.id);
  if (!existingRemote) {
    await createLiteLLMTeam({
      teamId: team.id,
      teamAlias,
      maxBudget: team.budgetUsdCents / 100,
      budgetDuration: team.budgetDuration ?? null,
      models: team.allowedModels ?? [],
      tpmLimit: team.tpmLimit ?? null,
      rpmLimit: team.rpmLimit ?? null,
    });
  }

  let keyInfo: { key: string; token: string };
  try {
    keyInfo = await generateLiteLLMKey(team.id);
  } catch (err) {
    if (!existingRemote) {
      await deleteLiteLLMTeam(team.id).catch((cleanupErr) =>
        console.error(
          `    cleanup: failed to delete LiteLLM team ${team.id}:`,
          cleanupErr,
        ),
      );
    }
    throw err;
  }

  try {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        litellmTeamId: team.id,
        litellmKeyToken: encryptApiKey(keyInfo.key),
      },
    });
  } catch (dbErr) {
    await deleteLiteLLMKey(keyInfo.token).catch((cleanupErr) =>
      console.error(
        `    cleanup: failed to revoke LiteLLM key for team ${team.id}:`,
        cleanupErr,
      ),
    );
    throw dbErr;
  }
}

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

        await provisionLiteLLMForTeam(prisma, teamId);

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
