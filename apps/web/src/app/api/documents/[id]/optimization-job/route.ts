import { NextResponse, type NextRequest } from 'next/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const doc = await db.userDocument.findFirst({
    where: { id, organizationId: orgId },
    select: { metadata: true },
  });

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const meta = doc.metadata as Record<string, unknown> | null;
  const job = meta?.optimizationJob ?? null;

  const activeVersion = await db.documentVersion.findFirst({
    where: { documentId: id, organizationId: orgId, isActive: true },
    select: { ragScore: true },
  });
  const versionScore = activeVersion?.ragScore as { total?: number } | null;
  const fileRagScore =
    typeof versionScore?.total === 'number' ? versionScore.total : null;

  return NextResponse.json({ job, fileRagScore });
}
