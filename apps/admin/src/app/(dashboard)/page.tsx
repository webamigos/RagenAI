import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [userCount, orgCount, threadCount, fileCount] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.thread.count(),
    prisma.userFile.count(),
  ]);

  return { userCount, orgCount, threadCount, fileCount };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const cards = [
    { label: 'Users', value: stats.userCount },
    { label: 'Organizations', value: stats.orgCount },
    { label: 'Threads', value: stats.threadCount },
    { label: 'Files', value: stats.fileCount },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-6"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
