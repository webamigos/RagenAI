export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const DEFAULT_ANSWER_INSTRUCTIONS =
  'You are an expert at interpreting and answering questions.';

export const systemTemplates = {
  answerChain: `
      {answer_instructions}
      {project_instructions}
      Using the chat history, answer the user's question to the best of your ability while strictly following the rules.

      <rules>
      - Always respond in the same language the user is writing in.
      - If you do not know the answer, clearly say so.
      - If the question is ambiguous or has multiple possible interpretations, ask the user for clarification.
      - Respond concisely and directly, without using XML tags in your response.
      </rules>`,
} as const;

export const humanTemplates = {
  answerChain: `Answer my question: {question}`,
} as const;
