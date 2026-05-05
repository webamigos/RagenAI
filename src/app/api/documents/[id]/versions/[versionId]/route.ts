import { NextResponse, type NextRequest } from 'next/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDocumentVersionDetailQuery } from '@/features/documents/services/queries/get-document-versions-query';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, versionId } = await params;
  try {
    const version = await getDocumentVersionDetailQuery(id, versionId);
    return NextResponse.json({ version });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === 'Document not found' ||
        err.message === 'Version not found')
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch version' },
      { status: 500 },
    );
  }
}
