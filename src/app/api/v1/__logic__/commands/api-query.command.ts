import type { ApiContext } from '../types/ApiContext';
import type { QueryDto } from '../dtos/query.dto';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { initializePublicRagChain } from '@/app/api/guest-threads/[...guestDetails]/services/initializePublicBasicRag';

// FIXME: it takes a lot of time
export async function apiRagQueryCommand(
  context: ApiContext,
  payload: QueryDto
) {
  // TODO: code duplication
  const rawSettings = await getAllSettings(context.orgId);
  if (!rawSettings.apiKey) {
    throw new ApiKeyError();
  }

  const chainOutput = await initializePublicRagChain({
    settings: { ...rawSettings, apiKey: rawSettings.apiKey },
    organizationId: context.orgId,
  });

  const streamResult = await chainOutput.stream({
    question: payload.content,
    chat_history: ' ', // FIXME: workaround
  });

  return await streamResult.text;
}
