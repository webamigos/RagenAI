import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { State } from '../types/agentic-rag';
import { BasicRagChainInput } from '../types/basic-rag';
import { RagAgent } from './agent/rag-agent';
import { logger } from '@/app/lib/utils/logger';
import { VectorStore } from '@langchain/core/vectorstores';
import { tools } from './config';

export const agenticRagFlow = async (
  input: BasicRagChainInput,
  model: BaseChatModel,
  vectorStore: VectorStore
) => {
  const state: State = {
    query: input.question,
    conversationHistory: input.chat_history ?? '',
    tools,
    actions: [],
    config: { maxIterations: 10 },
    nextMove: null,
    runId: '123', // todo
    currentIteration: 0,
  };

  const agent = new RagAgent(state, model, vectorStore);
  logger.info('🦾 RagAgent flow: Starting agentic RAG flow...');

  for (let i = 0; i <= state.config.maxIterations; i++) {
    logger.info(
      `🦾 RagAgent flow: Starting iteration ${i + 1} of ${
        state.config.maxIterations
      }`
    );

    const nextAction = await agent.plan();
    logger.info({ nextAction }, `🦾 RagAgent flow: Planned next action`);

    const reflection = await agent.reflect();
    logger.info({ reflection }, `🦾 RagAgent flow: Reflected on the action`);

    if (reflection.readyToGenerateAnswer) {
      logger.info(
        `🦾 RagAgent flow: Ready to generate answer, breaking out of loop`
      );
      break;
    }

    const tool = await agent.describeTool();
    logger.info({ tool }, `🦾 RagAgent flow: Described tool`);

    await agent.executeTool(tool);

    logger.info(
      `🦾 RagAgent flow: Finished iteration ${i + 1} of ${
        state.config.maxIterations
      }`
    );
    state.currentIteration++;
  }

  return agent.generateAnswer();
};
