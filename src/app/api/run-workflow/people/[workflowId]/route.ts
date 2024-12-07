import { NextResponse } from 'next/server';

import { getTemporalClient } from '@/temporal/client';

type Params = {
  params: { workflowId: string };
};

export const dynamic = 'force-dynamic';

export const GET = async (_request: Request, { params }: Params) => {
  const workflowId = params.workflowId;

  try {
    const client = await getTemporalClient();
    const handle = await client.workflow.getHandle(workflowId);
    const result = await handle.result();

    // remember to have launched temporal worker
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: true });
  }
};
