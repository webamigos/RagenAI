'use server';

import { type PromptDto, promptSchema } from '../../contracts/ChatDto';

export const sendPrompt = async (data: PromptDto) => {
  const parseResult = promptSchema.safeParse(data);

  if (!parseResult.success) {
    return {};
  }

  console.log('in server: ', data);
};
