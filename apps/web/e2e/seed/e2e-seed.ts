import { PrismaClient } from '../../src/generated/prisma/client';
import {
  SubscriptionPlanStatus,
  SubscriptionPlanType,
} from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';

import {
  TEST_USER_ID,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_USER_NAME,
  TEST_ORG_ID,
  TEST_ORG_SLUG,
  TEST_MEMBER_ID,
  TEST_ACCOUNT_ID,
  TEST_PROJECT_TITLE,
  TEST_PROJECT_ID,
  TEST_THREAD_ID,
  TEST_THREAD_TITLE,
  TEST_MESSAGE_USER_ID,
  TEST_MESSAGE_ASSISTANT_ID,
  TEST_ORG2_ID,
  TEST_DOCUMENT_ID,
  TEST_DOCUMENT_TITLE,
  TEST_DOCUMENT_V1_ID,
  TEST_DOCUMENT_V2_ID,
  TEST_DOCUMENT_V1_CONTENT,
  TEST_DOCUMENT_V2_CONTENT,
  TEST_ORG2_DOCUMENT_ID,
  TEST_ORG2_DOCUMENT_V1_ID,
  TEST_ORG2_SLUG,
  TEST_ORG2_NAME,
  TEST_MEMBER2_ID,
  TEST_FILE_ID,
  TEST_FILE_NAME,
} from '../constants.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function cleanup() {
  console.log('Cleaning up existing E2E test data...');

  // Delete in order respecting foreign key constraints
  // Clean up data created by test runs (threads, messages, audit logs, etc.)
  const orgIds = [TEST_ORG_ID, TEST_ORG2_ID];
  await prisma.threadPublicLink.deleteMany({
    where: { thread: { organizationId: { in: orgIds } } },
  });
  await prisma.message.deleteMany({
    where: { thread: { organizationId: { in: orgIds } } },
  });
  await prisma.thread.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.aiUsage.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  // Versions cascade from the document, but the document has to go before the
  // file it points at.
  await prisma.documentVersion.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.userDocument.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.userFile.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.project.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.subscription.deleteMany({
    where: { referenceId: TEST_ORG_ID },
  });
  await prisma.organizationSettings.deleteMany({
    where: { organizationId: TEST_ORG_ID },
  });
  await prisma.member.deleteMany({
    where: { id: { in: [TEST_MEMBER_ID, TEST_MEMBER2_ID] } },
  });
  await prisma.account.deleteMany({
    where: { id: TEST_ACCOUNT_ID },
  });
  await prisma.session.deleteMany({
    where: { userId: TEST_USER_ID },
  });
  await prisma.organizationSettings.deleteMany({
    where: { organizationId: TEST_ORG2_ID },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [TEST_ORG_ID, TEST_ORG2_ID] } },
  });
  await prisma.user.deleteMany({
    where: { id: TEST_USER_ID },
  });

  console.log('Cleanup complete.');
}

async function seed() {
  console.log('Seeding E2E test data...');

  // 1. Create user
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      name: TEST_USER_NAME,
      emailVerified: true,
      onboardingComplete: true,
      role: 'admin',
    },
  });
  console.log(`Created user: ${TEST_USER_EMAIL}`);

  // 2. Create account with hashed password
  const hashedPassword = await hashPassword(TEST_USER_PASSWORD);
  await prisma.account.create({
    data: {
      id: TEST_ACCOUNT_ID,
      userId: TEST_USER_ID,
      providerId: 'credential',
      // Better Auth 1.7 matches the credential account on all three of
      // providerId, issuer and accountId, and for a local credential it
      // expects accountId to be the user id, not the email. This seed writes
      // the row directly with Prisma, bypassing the library, so it has to
      // reproduce both — otherwise sign-in finds no account and every auth
      // spec times out waiting for the post-login redirect.
      accountId: TEST_USER_ID,
      issuer: 'local:credential',
      password: hashedPassword,
    },
  });
  console.log('Created account with credential provider');

  // 3. Create organization
  await prisma.organization.create({
    data: {
      id: TEST_ORG_ID,
      name: `${TEST_USER_NAME}'s Organization`,
      slug: TEST_ORG_SLUG,
      vectorStore: 'qdrant',
    },
  });
  console.log(`Created organization: ${TEST_ORG_SLUG}`);

  // 4. Create member (user as owner)
  await prisma.member.create({
    data: {
      id: TEST_MEMBER_ID,
      organizationId: TEST_ORG_ID,
      userId: TEST_USER_ID,
      role: 'owner',
    },
  });
  console.log('Created member with owner role');

  // 5. Create organization settings (required for upload storage limit checks)
  await prisma.organizationSettings.create({
    data: {
      organizationId: TEST_ORG_ID,
    },
  });
  console.log('Created organization settings');

  // 6. Ensure "Trial" subscription plan exists
  const trialPlan = await prisma.subscriptionPlan.findFirst({
    where: { name: 'Trial', type: SubscriptionPlanType.INTERNAL },
  });
  if (!trialPlan) {
    await prisma.subscriptionPlan.create({
      data: {
        name: 'Trial',
        type: SubscriptionPlanType.INTERNAL,
        status: SubscriptionPlanStatus.ACTIVE,
        limits: {},
        priceId: 'internal_trial',
      },
    });
    console.log('Created Trial subscription plan');
  }

  // 7. Create subscription
  await prisma.subscription.create({
    data: {
      id: `e2e-subscription-0000-0001`,
      plan: 'Trial',
      referenceId: TEST_ORG_ID,
      status: 'trialing',
    },
  });
  console.log('Created Trial subscription');

  // 8. Create project
  await prisma.project.create({
    data: {
      id: TEST_PROJECT_ID,
      title: TEST_PROJECT_TITLE,
      organizationId: TEST_ORG_ID,
      ownerId: TEST_USER_ID,
    },
  });
  console.log(`Created project: ${TEST_PROJECT_TITLE}`);

  // 9. Create a knowledge base file (so document preview tests have a row to click)
  await prisma.userFile.create({
    data: {
      id: TEST_FILE_ID,
      organizationId: TEST_ORG_ID,
      fileName: TEST_FILE_NAME,
      fileSize: 1024,
      fileType: 'TEXT',
      isUploaded: true,
      embeddingStatus: 'COMPLETED',
      parsingStatus: 'COMPLETED',
      ownerId: TEST_USER_ID,
    },
  });
  console.log(`Created test file: ${TEST_FILE_NAME}`);

  // 10. Create a thread with messages (so thread management tests don't need LLM)
  await prisma.thread.create({
    data: {
      id: TEST_THREAD_ID,
      title: TEST_THREAD_TITLE,
      organizationId: TEST_ORG_ID,
      userId: TEST_USER_ID,
      visitorId: TEST_USER_ID,
      projectId: TEST_PROJECT_ID,
    },
  });
  await prisma.message.create({
    data: {
      id: TEST_MESSAGE_USER_ID,
      content: 'Hello, this is a seeded test message.',
      role: 'USER',
      thread: { connect: { id: TEST_THREAD_ID } },
    },
  });
  await prisma.message.create({
    data: {
      id: TEST_MESSAGE_ASSISTANT_ID,
      content: 'This is the assistant response to the seeded message.',
      role: 'ASSISTANT',
      thread: { connect: { id: TEST_THREAD_ID } },
    },
  });
  console.log(`Created thread: ${TEST_THREAD_TITLE} with 2 messages`);

  // 11. Create second organization for org-switcher tests
  await prisma.organization.create({
    data: {
      id: TEST_ORG2_ID,
      name: TEST_ORG2_NAME,
      slug: TEST_ORG2_SLUG,
      vectorStore: 'qdrant',
    },
  });
  console.log(`Created second organization: ${TEST_ORG2_NAME}`);

  // 12. Add user as owner of second org
  await prisma.member.create({
    data: {
      id: TEST_MEMBER2_ID,
      organizationId: TEST_ORG2_ID,
      userId: TEST_USER_ID,
      role: 'owner',
    },
  });
  console.log('Created member for second org');

  // 13. Create org settings for second org
  await prisma.organizationSettings.create({
    data: {
      organizationId: TEST_ORG2_ID,
    },
  });
  console.log('Created organization settings for second org');

  // 14. Documents with version history — one per org, so the versioning tests
  // can assert both the happy path and cross-tenant isolation.
  await prisma.userDocument.create({
    data: {
      id: TEST_DOCUMENT_ID,
      organizationId: TEST_ORG_ID,
      title: TEST_DOCUMENT_TITLE,
      content: TEST_DOCUMENT_V2_CONTENT,
      fileId: TEST_FILE_ID,
      projectId: TEST_PROJECT_ID,
    },
  });

  await prisma.documentVersion.createMany({
    data: [
      {
        id: TEST_DOCUMENT_V1_ID,
        documentId: TEST_DOCUMENT_ID,
        organizationId: TEST_ORG_ID,
        versionNumber: 1,
        content: TEST_DOCUMENT_V1_CONTENT,
        title: TEST_DOCUMENT_TITLE,
        changeType: 'UPLOAD',
        authorId: TEST_USER_ID,
        isActive: false,
      },
      {
        id: TEST_DOCUMENT_V2_ID,
        documentId: TEST_DOCUMENT_ID,
        organizationId: TEST_ORG_ID,
        versionNumber: 2,
        content: TEST_DOCUMENT_V2_CONTENT,
        title: TEST_DOCUMENT_TITLE,
        changeType: 'MANUAL',
        authorId: TEST_USER_ID,
        isActive: true,
      },
    ],
  });
  console.log(`Created document with 2 versions: ${TEST_DOCUMENT_TITLE}`);

  await prisma.userDocument.create({
    data: {
      id: TEST_ORG2_DOCUMENT_ID,
      organizationId: TEST_ORG2_ID,
      title: 'E2E Other Org Document',
      content: 'Belongs to the second organization.',
    },
  });

  await prisma.documentVersion.create({
    data: {
      id: TEST_ORG2_DOCUMENT_V1_ID,
      documentId: TEST_ORG2_DOCUMENT_ID,
      organizationId: TEST_ORG2_ID,
      versionNumber: 1,
      content: 'Belongs to the second organization.',
      title: 'E2E Other Org Document',
      changeType: 'UPLOAD',
      isActive: true,
    },
  });
  console.log('Created second-org document with 1 version');

  console.log('E2E seed complete.');
}

async function main() {
  await cleanup();
  await seed();
}

main()
  .catch((e) => {
    console.error('E2E seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
