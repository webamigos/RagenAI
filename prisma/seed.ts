import { PlanStatus, PlanType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultPlans = [
  {
    name: 'Free',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
  {
    name: 'Trial',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
  {
    name: 'Enterprise',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
  {
    name: 'Amigos',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
];

async function main() {
  // eslint-disable-next-line no-console
  console.log('Start seeding default plans...');

  for (const plan of defaultPlans) {
    const existingPlan = await prisma.plan.findFirst({
      where: {
        name: plan.name,
        type: plan.type,
      },
    });

    if (!existingPlan) {
      await prisma.plan.create({
        data: plan,
      });
      // eslint-disable-next-line no-console
      console.log(`Created plan: ${plan.name}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`Plan ${plan.name} already exists, skipping...`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
