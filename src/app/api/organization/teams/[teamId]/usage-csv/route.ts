import { type NextRequest, NextResponse } from 'next/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { logger } from '@/app/lib/utils/logger';
import { getLiteLLMSpendLogs } from '@/libs/litellm/client';
import db from '@ragenai/prisma-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CSV_HEADERS = [
  'start_time',
  'end_time',
  'model',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'spend_usd',
  'user_id',
];

function csvCell(value: string | number | null | undefined): string {
  if (value == null) {
    return '';
  }
  const s = String(value);
  // Escape cells that contain delimiters or quotes per RFC 4180
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const team = await db.team.findFirst({
    where: { id: teamId, organizationId: orgId },
    select: { id: true, name: true, litellmTeamId: true, budgetDuration: true },
  });

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  if (!team.litellmTeamId) {
    return NextResponse.json(
      { error: 'Team has no LiteLLM counterpart yet' },
      { status: 409 },
    );
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

  let logs;
  try {
    logs = await getLiteLLMSpendLogs({
      teamId: team.litellmTeamId,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
  } catch (error) {
    logger.error(
      { err: error, teamId, orgId },
      'Failed to fetch spend logs for CSV export',
    );
    return NextResponse.json(
      { error: 'Failed to fetch spend logs' },
      { status: 502 },
    );
  }

  const rows = logs.map((log) =>
    [
      log.startTime,
      log.endTime,
      log.model,
      log.prompt_tokens,
      log.completion_tokens,
      log.total_tokens,
      log.spend,
      log.user,
    ]
      .map(csvCell)
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
