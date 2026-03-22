/* eslint-disable no-console */
/**
 * Migration script: Provision LiteLLM teams for all existing organizations.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx src/scripts/migrate-litellm-teams.ts
 *
 * Idempotent: safe to re-run — skips orgs that already have a team/key.
 */
import pg from 'pg';
import CryptoJS from 'crypto-js';

const { Pool } = pg;

const LITELLM_PROXY_URL =
  process.env.LITELLM_PROXY_URL || 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const DATABASE_URL =
  process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL or DATABASE_DIRECT_URL is required');
  process.exit(1);
}
if (!SECRET_KEY) {
  console.error('SECRET_KEY is required for encrypting LiteLLM API keys');
  process.exit(1);
}

function encryptApiKey(apiKey: string): string {
  return CryptoJS.AES.encrypt(apiKey, SECRET_KEY!).toString();
}

function masterKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (LITELLM_MASTER_KEY) {
    headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
  }
  return headers;
}

async function getLiteLLMTeamInfo(teamId: string) {
  try {
    const response = await fetch(
      `${LITELLM_PROXY_URL}/team/info?team_id=${encodeURIComponent(teamId)}`,
      { headers: masterKeyHeaders(), signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.team_info ?? data;
  } catch {
    return null;
  }
}

async function createLiteLLMTeam(teamId: string, teamAlias: string) {
  const response = await fetch(`${LITELLM_PROXY_URL}/team/new`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({
      team_id: teamId,
      team_alias: teamAlias,
      budget_duration: '30d',
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to create team: ${response.status} ${text}`);
  }
  return response.json();
}

async function generateLiteLLMKey(teamId: string) {
  const response = await fetch(`${LITELLM_PROXY_URL}/key/generate`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({
      team_id: teamId,
      key_alias: `ragen-${teamId}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to generate key: ${response.status} ${text}`);
  }
  return response.json();
}

async function updateLiteLLMTeam(
  teamId: string,
  params: Record<string, unknown>,
) {
  const response = await fetch(`${LITELLM_PROXY_URL}/team/update`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({ team_id: teamId, ...params }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to update team: ${response.status} ${text}`);
  }
  return response.json();
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const { rows: organizations } = await pool.query<{
      id: string;
      name: string;
    }>('SELECT id, name FROM organizations');
    console.log(`Found ${organizations.length} organizations to migrate`);

    let processed = 0;
    let failed = 0;

    for (const org of organizations) {
      try {
        console.log(`Processing org: ${org.name} (${org.id})`);

        // 1. Create LiteLLM team if it doesn't exist
        const existing = await getLiteLLMTeamInfo(org.id);
        if (!existing) {
          await createLiteLLMTeam(org.id, org.name);
          console.log('  Created LiteLLM team');
        }

        // 2. Generate virtual key if org doesn't have one
        const { rows: settings } = await pool.query<{
          litellm_api_key: string | null;
        }>(
          'SELECT litellm_api_key FROM organization_settings WHERE organization_id = $1',
          [org.id],
        );

        if (!settings[0]?.litellm_api_key) {
          const keyInfo = await generateLiteLLMKey(org.id);
          const encryptedKey = encryptApiKey(keyInfo.key);

          await pool.query(
            `INSERT INTO organization_settings (id, organization_id, litellm_api_key, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
             ON CONFLICT (organization_id)
             DO UPDATE SET litellm_api_key = $2, updated_at = NOW()`,
            [org.id, encryptedKey],
          );
          console.log('  Generated and stored virtual key');
        }

        // 3. Sync budget from org settings
        const { rows: limitsRows } = await pool.query<{
          monthly_cost_limit_cents: number | null;
        }>(
          'SELECT monthly_cost_limit_cents FROM organization_settings WHERE organization_id = $1',
          [org.id],
        );
        const costLimitCents = limitsRows[0]?.monthly_cost_limit_cents;
        const maxBudget = costLimitCents != null ? costLimitCents / 100 : null;

        await updateLiteLLMTeam(org.id, {
          max_budget: maxBudget,
          budget_duration: maxBudget != null ? '30d' : null,
        });

        // 4. Sync allowed models
        const { rows: modelRows } = await pool.query<{
          allowed_models: string[];
        }>(
          'SELECT allowed_models FROM organization_settings WHERE organization_id = $1',
          [org.id],
        );
        const allowedModels = modelRows[0]?.allowed_models || [];

        if (allowedModels.length > 0) {
          await updateLiteLLMTeam(org.id, { models: allowedModels });
        }

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
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
