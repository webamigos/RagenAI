import { NextResponse } from 'next/server';

import { type PromptDto, promptSchema } from '../../contracts/Prompt';
import { sendForModeration } from '../../lib/services/moderation';
import { askAssistant } from '../../lib/services/assistant';

export const POST = async (request: Request) => {
  const requestData = await promptSchema.safeParseAsync(await request.json());
  if (!requestData.success) {
    return NextResponse.json(requestData.error.format(), { status: 400 });
  }

  const prompt = requestData.data.prompt;

  const moderationResult = await sendForModeration(prompt);
  if (moderationResult.status !== 200) {
    // TODO: implement
    return NextResponse.json({ status: '' }, { status: 400 });
  }
  const moderationData = moderationResult.data.results[0];

  if (moderationData.flagged) {
    // TODO: implement
    return NextResponse.json({ status: 'flagged' }, { status: 400 });
  }

  // await askAssistant(prompt, 'thread_OOc9fxXw08vvz4zh1ZOZxdv5');
  await askAssistant(prompt);

  return NextResponse.json({ status: 'ok' });

  // StreamingTextResponse(OpenAIStream(completions))
};
