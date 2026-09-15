import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * `llmGateway` was here for the Phase B measurement: it answered which of two
 * paths *this* process was running, because a benchmark that recorded what it
 * was told would have stamped "native" on a run the proxy served. B6 left one
 * path, so the field reported a constant and is gone rather than kept as a
 * decoration — anything still reading it should read nothing, not `"native"`
 * forever.
 */
export const GET = async () => {
  return NextResponse.json({ status: 'ok' });
};
