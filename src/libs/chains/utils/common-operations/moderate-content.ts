import { BaseChain } from 'langchain/chains';
import { RunnableLambda } from '@langchain/core/runnables';
import { runModeration } from '../chain-utils';
import type { BaseChatChainInput } from '../../types/common';

export const moderateContent = (
  moderator: BaseChain,
  moderateHistory = true
) => {
  if (!moderator) {
    throw new Error('Error moderating content: No moderation instance');
  }

  return new RunnableLambda({
    func: async (input: BaseChatChainInput) => {
      const contentToModerate = moderateHistory
        ? `${input.question} ${input.chat_history}`
        : input.question;
      await runModeration(moderator, contentToModerate);
      return input;
    },
  }).withConfig({
    runName: 'Moderate content',
  });
};
