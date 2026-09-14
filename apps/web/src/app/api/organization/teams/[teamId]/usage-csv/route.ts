import { type NextRequest, NextResponse } from 'next/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';
// This route used to carry its own `csvCell`, which quoted per RFC 4180 but did
// not neutralise a leading `=`/`+`/`-`/`@`. A spreadsheet evaluates those, so a
// model name or user id shaped like a formula ran on the downloader's machine.
import { escapeCsvCell } from '@ragenai/platform-contracts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CSV_HEADERS = [
  'created_at',
  'step',
  'provider',
  'model',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'spend_usd',
  'user_id',
  'project_id',
  'thread_id',
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const team = await db.team.findFirst({
    where: { id: teamId, organizationId: orgId },
    select: { id: true, name: true, budgetDuration: true },
  });

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Match the default window used by the usage query so admins see the
  // same data as the dashboard.
  const daysByDuration: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  };
  const days = daysByDuration[team.budgetDuration] ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  // Reads `ai_usage`, so the export and the dashboard cannot disagree — and
  // so an unreachable proxy can no longer turn a team's month into an empty
  // file with a 200 beside it. A failure here throws and is reported.
  let usage;
  try {
    usage = await db.aiUsage.findMany({
      where: {
        organizationId: orgId,
        teamId: team.id,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        step: true,
        provider: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
        userId: true,
        projectId: true,
        threadId: true,
      },
    });
  } catch (error) {
    logger.error(
      { err: error, teamId, orgId },
      'Failed to read team usage for CSV export',
    );
    return NextResponse.json(
      { error: 'Failed to read team usage' },
      { status: 500 },
    );
  }

  const rows = usage.map((row) =>
    [
      row.createdAt.toISOString(),
      row.step,
      row.provider,
      row.model,
      row.inputTokens,
      row.outputTokens,
      row.totalTokens,
      row.estimatedCost,
      row.userId,
      row.projectId,
      row.threadId,
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );

  const body = [CSV_HEADERS.join(','), ...rows].join('\n');

  const safeName = team.name.replace(/[^a-z0-9-_]/gi, '_');
  const filename = `team-${safeName}-usage-${end.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
