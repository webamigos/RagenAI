export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';
export const HISTORY_CHARACTER_LIMIT = 60000;
export const MAX_USER_INPUT_LENGTH = 10000;

export const modelParams = {
  answer: {
    modelName: 'gpt-4o',
    temperature: 0.8,
  },

  standaloneQuestion: {
    modelName: 'gpt-4o-mini',
    temperature: 0,
  },
} as const;
