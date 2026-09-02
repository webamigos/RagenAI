import { NextResponse, type NextRequest } from 'next/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDocumentVersionsQuery } from '@/features/documents/services/queries/get-document-versions-query';
import { getDocumentActor } from '@/features/documents/services/queries/get-document-actor';

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
  try {
    const actor = await getDocumentActor(orgId);
    const versions = await getDocumentVersionsQuery(id, orgId, actor);
    return NextResponse.json({ versions });
  } catch (err) {
    if (err instanceof Error && err.message === 'Document not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch versions' },
      { status: 500 },
    );
  }
}
