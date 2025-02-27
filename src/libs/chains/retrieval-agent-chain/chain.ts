import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  generateFinalAnswer,
  rephraseQuestion,
  retrieveRelevantDocuments,
} from '../basic-rag/operations';
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';
import { CHAIN_FINAL_ANSWER_RUN_NAME } from '../basic-rag/config';
import type { BasicRagChainParams } from '../types/basic-rag';
import type { BaseChatChainInput, BaseChatChainOutput } from '../types/common';

import { Annotation } from '@langchain/langgraph';

import { createRetrieverTool } from 'langchain/tools/retriever';
import { ToolNode } from '@langchain/langgraph/prebuilt';

import { END } from '@langchain/langgraph';
import { pull } from 'langchain/hub';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { StateGraph } from '@langchain/langgraph';
import { START } from '@langchain/langgraph';
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * Creates a basic RAG (Retrieval-Augmented Generation) chain.
 *
 * @param {VectorStore} params.vectorStore - The vector store instance used for document retrieval.
 * @param {Object} params.models - LLM models used in the chain.
 * @param {ContentModerator} params.models.contentModerator - Model for content moderation, any BaseChain instance can be used.
 * @param {QuestionRephraser} params.models.questionRephraser - Model for rephrasing questions, any BaseChatModel instance can be used.
 * @param {AnswerGenerator} params.models.answerGenerator - Model for generating final answers, any BaseChatModel instance can be used.
 * @param {BasicRagChainConfig} params.config - Configuration for the chain.
 * @returns {BasicRagChainOutput} An object containing the chain and the final answer run name. Final answer run name can be used to filter events while stream processing.
 */
export const retrievalAgentChain = async ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams) => {
  const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
    question: Annotation<string>(),
    chat_history: Annotation<string>(),
    standalone_question: Annotation<BaseMessage[]>({
      reducer: (_x, y) => y,
      default: () => [],
    }),
  });

  const tool = createRetrieverTool(
    vectorStore.asRetriever({ k: config?.maxDocumentsToRetrieve }),
    {
      name: 'search_knowledge_base',
      description: 'Search and return information in the knowledge base.',
    }
  );
  const tools = [tool];

  const toolNode = new ToolNode<typeof GraphState.State>(tools);

  async function generateStandaloneQuestion(state: typeof GraphState.State) {
    const rephraser = rephraseQuestion(models.questionRephraser);
    const standaloneQuestion = await rephraser.invoke({
      question: state.question,
      chat_history: state.chat_history,
    });

    return {
      standalone_question: standaloneQuestion,
    };
  }

  /**
   * Decides whether the agent should retrieve more information or end the process.
   * This function checks the last message in the state for a function call. If a tool call is
   * present, the process continues to retrieve information. Otherwise, it ends the process.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {string} - A decision to either "continue" the retrieval process or "end" it.
   */
  function shouldRetrieve(state: typeof GraphState.State): string {
    const { messages } = state;
    // eslint-disable-next-line no-console
    console.log('---DECIDE TO RETRIEVE---');
    const lastMessage = messages[messages.length - 1];

    if (
      'tool_calls' in lastMessage &&
      Array.isArray(lastMessage.tool_calls) &&
      lastMessage.tool_calls.length
    ) {
      // eslint-disable-next-line no-console
      console.log('---DECISION: RETRIEVE---');
      return 'retrieve';
    }
    // If there are no tool calls then we finish.
    return 'generate';
  }

  /**
   * Determines whether the Agent should continue based on the relevance of retrieved documents.
   * This function checks if the last message in the conversation is of type FunctionMessage, indicating
   * that document retrieval has been performed. It then evaluates the relevance of these documents to the user's
   * initial question using a predefined model and output parser. If the documents are relevant, the conversation
   * is considered complete. Otherwise, the retrieval process is continued.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async function gradeDocuments(
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> {
    // eslint-disable-next-line no-console
    console.log('---GET RELEVANCE---');

    const { messages } = state;
    const tool = {
      name: 'give_relevance_score',
      description: 'Give a relevance score to the retrieved documents.',
      schema: z.object({
        binaryScore: z.string().describe("Relevance score 'yes' or 'no'"),
      }),
    };

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a grader assessing relevance of retrieved docs to a user question.
    Here are the retrieved docs:
    \n ------- \n
    {context} 
    \n ------- \n
    Here is the user question: {question}
    Here is the standalone question: {standalone_question}

    If the content of the docs are relevant to the users question, score them as relevant.
    Give a binary score 'yes' or 'no' score to indicate whether the docs are relevant to the question.
    Yes: The docs are relevant to the question.
    No: The docs are not relevant to the question.`
    );

    const model = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0,
    }).bindTools([tool], {
      tool_choice: tool.name,
    });

    const chain = prompt.pipe(model);

    const lastMessage = messages[messages.length - 1];

    const score = await chain.invoke({
      question: messages[0].content as string,
      context: lastMessage.content as string,
      standalone_question: state.standalone_question,
    });

    return {
      messages: [score],
    };
  }

  /**
   * Check the relevance of the previous LLM tool call.
   *
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {string} - A directive to either "yes" or "no" based on the relevance of the documents.
   */
  function checkRelevance(state: typeof GraphState.State): string {
    // eslint-disable-next-line no-console
    console.log('---CHECK RELEVANCE---');

    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (!('tool_calls' in lastMessage)) {
      throw new Error(
        "The 'checkRelevance' node requires the most recent message to contain tool calls."
      );
    }
    const toolCalls = (lastMessage as AIMessage).tool_calls;
    if (!toolCalls || !toolCalls.length) {
      throw new Error('Last message was not a function message');
    }

    if (toolCalls[0].args.binaryScore === 'yes') {
      // eslint-disable-next-line no-console
      console.log('---DECISION: DOCS RELEVANT---');
      return 'yes';
    }
    // eslint-disable-next-line no-console
    console.log('---DECISION: DOCS NOT RELEVANT---');
    return 'no';
  }

  // Nodes

  /**
   * Invokes the agent model to generate a response based on the current state.
   * This function calls the agent model to generate a response to the current conversation state.
   * The response is added to the state's messages.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async function agent(
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> {
    // eslint-disable-next-line no-console
    console.log('---CALL AGENT---');

    const { messages } = state;
    // Find the AIMessage which contains the `give_relevance_score` tool call,
    // and remove it if it exists. This is because the agent does not need to know
    // the relevance score.
    const filteredMessages = messages.filter((message) => {
      if (
        'tool_calls' in message &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0
      ) {
        return message.tool_calls[0].name !== 'give_relevance_score';
      }
      return state.standalone_question;
    });

    const model = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0,
      streaming: true,
    }).bindTools(tools);

    const systemMessage = new SystemMessage(
      `You are a helpful assistant that can answer questions and help with tasks.
      Here is the chat history:
      ${state.chat_history}
      Here is the question:
      ${state.question}
      Here is the standalone question:
      ${state.standalone_question}
      `
    );
    const response = await model.invoke([systemMessage, ...filteredMessages]);
    return {
      messages: [response],
    };
  }

  /**
   * Transform the query to produce a better question.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async function rewrite(
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> {
    // eslint-disable-next-line no-console
    console.log('---TRANSFORM QUERY---');

    const { messages, chat_history } = state;
    const question = messages[0].content as string;
    const prompt = ChatPromptTemplate.fromTemplate(
      `Look at the input and try to reason about the underlying semantic intent / meaning. \n 
      You must always return a question in the language of the question.
  Here is the initial question:
  \n ------- \n
  {question} 
  \n ------- \n
  Here is the chat history:
  \n ------- \n
  {chat_history}
  \n ------- \n
  Formulate an improved question:`
    );

    // Grader
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0.8,
      streaming: true,
    });
    const response = await prompt
      .pipe(model)
      .invoke({ question, chat_history });
    return {
      messages: [response],
    };
  }

  async function generate(
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> {
    // eslint-disable-next-line no-console
    console.log('---GENERATE---');

    const { messages, chat_history } = state;
    const question = messages[0].content as string;
    // Extract the most recent ToolMessage
    const lastToolMessage = messages
      .slice()
      .reverse()
      .find((msg) => msg._getType() === 'tool');
    if (!lastToolMessage) {
      throw new Error('No tool message found in the conversation history');
    }

    const docs = lastToolMessage.content as string;

    // const prompt = await pull<ChatPromptTemplate>('rlm/rag-prompt');

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.
Question: {question} 
Context: {context} 
Conversation history: {chat_history}
Answer:`
    );

    const llm = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0.8,
      streaming: true,
    });

    const ragChain = prompt.pipe(llm);

    const response = await ragChain.invoke({
      context: docs,
      question,
      chat_history,
    });

    return {
      messages: [response],
    };
  }

  const workflow = new StateGraph(GraphState)
    // Define the nodes which we'll cycle between.
    .addNode('generateStandaloneQuestion', generateStandaloneQuestion)
    .addNode('agent', agent)
    .addNode('retrieve', toolNode)
    .addNode('gradeDocuments', gradeDocuments)
    .addNode('rewrite', rewrite)
    .addNode('generate', generate);

  // Call agent node to decide to retrieve or not
  workflow.addEdge(START, 'generateStandaloneQuestion');
  workflow.addEdge('generateStandaloneQuestion', 'agent');

  // Decide whether to retrieve
  workflow.addConditionalEdges(
    'agent',
    // Assess agent decision
    shouldRetrieve,
    {
      retrieve: 'retrieve',
      generate: 'generate',
    }
  );

  workflow.addEdge('retrieve', 'gradeDocuments');

  // Edges taken after the `action` node is called.
  workflow.addConditionalEdges(
    'gradeDocuments',
    // Assess agent decision
    checkRelevance,
    {
      // Call tool node
      yes: 'generate',
      no: 'rewrite', // placeholder
    }
  );

  workflow.addEdge('generate', END);
  workflow.addEdge('rewrite', 'agent');

  // Compile
  const app = workflow.compile();

  return { chain: app, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};

//   const chain = RunnableSequence.from<BaseChatChainInput, string>([
//     sanitizeAndValidateInput,
//     moderateContent(models.contentModerator),
//     RunnablePassthrough.assign({
//       standalone_question: rephraseQuestion(models.questionRephraser),
//     }),
//     RunnablePassthrough.assign({
//       context: await retrieveRelevantDocuments(
//         vectorStore,
//         config?.maxDocumentsToRetrieve
//       ),
//     }),
//     generateFinalAnswer(
//       models.answerGenerator,
//       CHAIN_FINAL_ANSWER_RUN_NAME,
//       config?.answerInstructions
//     ),
//   ]).withConfig({
//     runName: 'Basic RAG chain',
//   });
//   return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };

function formatMessagesForLangChain(
  conversationHistory: string,
  userQuestion: string
) {
  const messages = [];

  // Process conversation history if it exists
  if (conversationHistory) {
    // Split by newline and process each message
    const historyLines = conversationHistory.split('\n');

    for (const line of historyLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const role = line.substring(0, colonIndex).trim();
        const content = line.substring(colonIndex + 1).trim();

        if (content) {
          if (role.toUpperCase() === 'USER' || role.toUpperCase() === 'HUMAN') {
            messages.push(new HumanMessage(content));
          } else if (
            role.toUpperCase() === 'ASSISTANT' ||
            role.toUpperCase() === 'AI'
          ) {
            messages.push(new AIMessage(content));
          }
        }
      }
    }
  }

  // Add the current user question as the last message
  messages.push(new HumanMessage(userQuestion));

  return messages;
}
