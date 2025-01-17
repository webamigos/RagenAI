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
import { z } from 'zod';

export class RagAgent {
  constructor(
    private readonly state: State,
    private readonly model: BaseChatModel,
    private readonly vectorStore: VectorStore
  ) {}

  async plan() {
    logger.info('🦾 RagAgent: Planning next action...');

    const responseSchema = z.object({
      _reasoning: z
        .string()
        .describe(
          'Brief explanation of why this action is the most appropriate next step'
        ),
      tool: z.string().describe('tool_name'),
      query: z
        .string()
        .describe(
          'Please put here not to the tool executor what should be done with this tool. Use natural language, be very specific.'
        ),
    });

    const model = this.model.withStructuredOutput(responseSchema);
    const promptMessages = ChatPromptTemplate.fromMessages([
      ['system', systemTemplates.plan],
    ]);

    const chain = RunnableSequence.from([promptMessages, model]).withConfig({
      runName: `Iteration: ${this.state.currentIteration} - Planing next action`,
    });

    if (!this.state.tools.length) {
      throw new Error('Misconfigured agent, no tools available');
    }

    //Todo think about adding conv history
    const currentDate = new Date().toISOString();
    const lastMessage = this.state.query;
    const availableTools = this.state.tools.length
      ? `<tools>\n${this.state.tools
          .map(
            (t) =>
              `  <tool name="${t.name}" description="${t.briefDescription}" />`
          )
          .join('\n')}\n</tools>`
      : 'No tools available';
    const actionsTaken = `Actions taken: ${
      this.state.actions.length
        ? this.state.actions
            .map(
              (a) => `
            <action name="${a.name}" params="${a.parameters}" description="${a.description}" >
              <result>
              ${a.result}
              </result>
            </action>
          `
            )
            .join('\n')
        : 'No actions taken'
    }`;

    const result = await chain.invoke({
      currentDate,
      lastMessage,
      availableTools,
      actionsTaken,
      conversationHistory: this.state.conversationHistory,
    });

    this.state.nextMove = result;

    return result;
  }

  async reflect(): Promise<{ readyToGenerateAnswer: boolean }> {
    logger.info('🦾 RagAgent: Reflecting on the current state...');

    const finalAnswerReady = this.state.nextMove?.tool === 'final_answer';
    const toolInfo = this.state.tools.find((t) => t.name === 'final_answer');

    if (finalAnswerReady && toolInfo) {
      this.state.actions.push({
        id: toolInfo.id,
        name: toolInfo.name,
        parameters: JSON.stringify({}),
        description: toolInfo.briefDescription,
        result: JSON.stringify({}),
        toolId: toolInfo.id,
        iteration: this.state.currentIteration,
      });
    }

    return { readyToGenerateAnswer: finalAnswerReady };
  }

  async describeTool(): Promise<{ tool: string; parameters: any }> {
    logger.info('🦾 RagAgent: Describing tool...');

    const action = this.state.nextMove;
    if (!action) {
      throw new Error('No action to describe');
    }

    const model = this.model;

    const toolInfo = this.state.tools.find((t) => t.name === action.tool);
    if (!toolInfo) {
      throw new Error('No tool info found');
    }

    const toolName = toolInfo.name;
    const conversationHistory = this.state.conversationHistory;
    const currentDate = new Date().toISOString();
    const toolDescription = toolInfo.briefDescription;
    const toolParameters = toolInfo.usageInstructions;
    const toolInstruction = toolInfo.usageInstructions;
    const originalQuery = action.query;
    const lastMessage = this.state.query;
    const previousActions = this.state.actions
      .map((a) => `${a.name}: ${a.parameters}`)
      .join(', ');

    const promptMessages = ChatPromptTemplate.fromMessages([
      ['system', systemTemplates.describeTool],
    ]);

    const chain = RunnableSequence.from([
      promptMessages,
      model,
      new StringOutputParser(),
    ]).withConfig({
      runName: `Iteration: ${this.state.currentIteration} - Describing tool`,
    });

    const result = await chain.invoke({
      toolName,
      currentDate,
      toolDescription,
      toolParameters,
      originalQuery,
      lastMessage,
      previousActions,
      toolInstruction,
      conversationHistory,
    });

    const parameters = JSON.parse(result);
    return {
      tool: action.tool,
      parameters: parameters as any,
    };

    // return {
    //   tool: 'vector_store_search',
    //   parameters: { question: this.state.query },
    // };
  }

  async executeTool({ tool, parameters }: { tool: string; parameters: any }) {
    logger.info({ tool }, '🦾 RagAgent: Executing tool...');

    let result: any = null;

    if (tool === 'vector_store_search') {
      const questions = parameters.questions;
      const allResponses = [];

      for (const question of questions) {
        const response = await this.retrieveRelevantDocuments(
          this.vectorStore,
          question
        );
        allResponses.push(response);
      }

      result = allResponses;
    } else if (tool === 'who_am_i') {
      const systemPrompt = ChatPromptTemplate.fromMessages([
        ['system', systemTemplates.whoAmI],
        ['human', humanTemplates.whoAmI],
      ]);

      const chain = RunnableSequence.from([
        systemPrompt,
        this.model,
        new StringOutputParser(),
      ]).withConfig({
        runName: `Introducing myself`,
      });

      result = await chain.invoke({ originalQuery: this.state.query });
      logger.info({ result }, '🦾 RagAgent: Introduced myself');
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
                    ${a.result?.replaceAll('{', '{{')?.replaceAll('}', '}}')}
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
    maxDocuments = 2
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
