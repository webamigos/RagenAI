import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { State } from '../../types/agentic-rag';
import { logger } from '@/app/lib/utils/logger';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { combineDocuments } from '../../utils/chain-utils';
import { VectorStore } from '@langchain/core/vectorstores';
import { systemTemplates, humanTemplates } from '../config';

export class RagAgent {
  constructor(
    private readonly state: State,
    private readonly model: BaseChatModel,
    private readonly vectorStore: VectorStore
  ) {}

  async plan() {
    logger.info('🦾 RagAgent: Planning next action...');
    this.state.nextMove = {
      _reasoning: 'I need to retrieve relevant documents',
      tool: 'vector_store_search',
      query: this.state.query,
    };
  }

  async reflect(): Promise<{ readyToGenerateAnswer: boolean }> {
    logger.info('🦾 RagAgent: Reflecting on the current state...');
    return { readyToGenerateAnswer: this.state.currentIteration >= 3 };
  }

  async describeTool(): Promise<{ tool: string; parameters: any }> {
    logger.info('🦾 RagAgent: Describing tool...');
    return {
      tool: 'vector_store_search',
      parameters: { question: this.state.query },
    };
  }

  async executeTool({ tool, parameters }: { tool: string; parameters: any }) {
    logger.info('🦾 RagAgent: Executing tool...');

    let result: any = null;

    if (tool === 'vector_store_search') {
      result = await this.retrieveRelevantDocuments(
        this.vectorStore,
        parameters.question
      );
    } else {
      throw new Error(`Tool ${tool} not found`);
    }

    this.state.actions.push({
      id: '1',
      name: 'vector_store_search',
      parameters: JSON.stringify({ query: parameters.question }),
      description: 'Call vector store search tool',
      result: JSON.stringify(result),
      toolId: '1',
      iteration: this.state.currentIteration,
    });

    return result;
  }

  async generateAnswer() {
    logger.info('🦾 RagAgent: Generating answer...');
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', systemTemplates.finalAnswer],
      new MessagesPlaceholder('chat_history'),
      ['human', humanTemplates.finalAnswer],
    ]);

    const chain = RunnableSequence.from([
      promptTemplate,
      this.model,
      new StringOutputParser().withConfig({
        runName: 'final_answer', //TODO: export to common config
      }),
    ]).withConfig({
      runName: 'Generate final answer',
    });

    const actionsTaken = `Actions taken: ${
      this.state.actions.length
        ? this.state.actions
            .map(
              (a) => `
                <action name="${a.name}" params="${
                a.parameters
              }" description="${a.description}" >
                  <result>
                    ${a.result.replaceAll('{', '{{').replaceAll('}', '}}')}
                  </result>
                </action>
              `
            )
            .join('\n')
        : 'No actions taken'
    }`;

    return chain.invoke({
      chat_history: this.state.conversationHistory,
      question: this.state.query,
      standalone_question: this.state.query,
      answer_instructions: '',
      context: actionsTaken,
    });
  }

  private retrieveRelevantDocuments(
    vectorStore: VectorStore,
    query: string,
    maxDocuments = 4
  ) {
    if (!vectorStore) {
      throw new Error('Error retrieving relevant documents: No vector store');
    }

    const chain = RunnableSequence.from([
      (input) => input.standalone_question,
      vectorStore.asRetriever({ k: maxDocuments }),
      combineDocuments,
    ]).withConfig({
      runName: 'Retrieve relevant documents',
    });

    return chain.invoke({ standalone_question: query });
  }
}
