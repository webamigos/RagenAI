/**
 * Creates the tenant the offline test environment runs against, and mints one
 * opaque API key for it.
 *
 * Both halves matter for what the tests then prove:
 *
 *  - the tenant is written the way the application writes it (Better Auth's
 *    `Organization` + `Member`, Ragen's `OrganizationSettings`, `Subscription`
 *    and `Project`), so plan gating and the storage limit checks behave;
 *  - the key is minted the way `create-api-key-command.ts` mints one — the
 *    secret goes to ragen-token-vault under `api-key-<id>` and the database
 *    keeps only the mask (ADR-13). Anything that skipped the vault would make
 *    `ApiKeyGuard` reject every request, so this is the real path.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '../../apps/web/src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { RagenAuthClient } from '../../packages/vault-client/src/index.js';

const VAULT_PROVIDER = 'ragen-api-key';

const ORG_ID = 'test-org-0000-0000-0001';
const ORG_SLUG = 'acme-industries';
const USER_ID = 'test-user-0000-0000-0001';
const PROJECT_ID = '11111111-2222-3333-4444-555555555555';

function maskApiKey(key: string): string {
  return `${key.slice(0, 11)}...${key.slice(-4)}`;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const vault = new RagenAuthClient({
    baseUrl: process.env.RAGEN_TOKEN_VAULT_URL!,
    secret: process.env.RAGEN_TOKEN_VAULT_SERVICE_SECRET!,
    serviceName: 'offline-test-setup',
  });

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      email: 'tester@acme.example',
      name: 'Acme Tester',
      emailVerified: true,
      onboardingComplete: true,
      role: 'admin',
    },
  });

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'Acme Industries',
      slug: ORG_SLUG,
      vectorStore: 'qdrant',
    },
  });

  await prisma.member.upsert({
    where: { id: 'test-member-0000-0001' },
    update: {},
    create: {
      id: 'test-member-0000-0001',
      organizationId: ORG_ID,
      userId: USER_ID,
      role: 'owner',
    },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: ORG_ID },
    update: {},
    create: { organizationId: ORG_ID },
  });

  // The Enterprise plan is what the root seed calls the unrestricted one, and
  // `apiAccess` has to be on or key creation refuses.
  const plan =
    (await prisma.subscriptionPlan.findFirst({
      where: { name: 'Enterprise' },
    })) ??
    (await prisma.subscriptionPlan.findFirst({ where: { name: 'Trial' } }));

  if (!plan) {
    throw new Error(
      'No subscription plan seeded — run `npm run db:seed` first',
    );
  }

  await prisma.subscription.upsert({
    where: { id: 'test-subscription-0000-0001' },
    update: { plan: plan.name, status: 'active' },
    create: {
      id: 'test-subscription-0000-0001',
      plan: plan.name,
      referenceId: ORG_ID,
      status: 'active',
    },
  });

  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: {},
    create: {
      id: PROJECT_ID,
      title: 'Acme HR Assistant',
      organizationId: ORG_ID,
      ownerId: USER_ID,
    },
  });

  // One org-scoped key. `KNOWLEDGE_BASE` is the default scope: the whole
  // organisation's knowledge base, no assistant binding.
  const row = await prisma.apiKey.create({
    data: {
      name: 'offline-test-key',
      maskedValue: '',
      organizationId: ORG_ID,
      knowledgeScope: 'KNOWLEDGE_BASE',
      createdBy: USER_ID,
      debugMode: true,
    },
  });

  const fullKey = `sk-${row.id}.${randomBytes(32).toString('base64url')}`;
  await vault.storeToken(`api-key-${row.id}`, VAULT_PROVIDER, {
    accessToken: fullKey,
  });
  await prisma.apiKey.update({
    where: { id: row.id },
    data: { maskedValue: maskApiKey(fullKey) },
  });

  console.log(
    JSON.stringify(
      {
        orgId: ORG_ID,
        orgSlug: ORG_SLUG,
        userId: USER_ID,
        projectId: PROJECT_ID,
        plan: plan.name,
        apiKeyId: row.id,
        apiKey: fullKey,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
