import { NextResponse } from 'next/server';
import { gatewayModeFromEnv } from '@ragenai/llm-gateway';

export const dynamic = 'force-dynamic';

/**
 * `llmGateway` is here for the Phase B measurement, and the reason it is
 * answered by the app rather than read from the harness's own environment is
 * the whole point of it: the flag lives in *this* process, and a benchmark
 * that recorded what it was told would happily stamp "native" on a run the app
 * served through the proxy. That is the one mistake the comparison cannot
 * survive, because both arms would still look like plausible numbers.
 *
 * It is a routing mode, not a secret — no endpoint, no credential, nothing
 * that is not already implied by which models the deployment answers with.
 */
export const GET = async () => {
  return NextResponse.json({
    status: 'ok',
    llmGateway: gatewayModeFromEnv(),
  });
};
