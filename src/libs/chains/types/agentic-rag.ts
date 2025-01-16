type AgentConfig = {
  maxIterations: number;
};

export type Tool = {
  id: string;
  name: string;
  briefDescription: string;
  usageInstructions: string;
  parametersSchema: string;
};

type Action = {
  id: string;
  name: string;
  description: string;
  parameters: string;
  result: string;
  toolId: string;
  iteration: number;
};

type NextPlannedAction = {
  _reasoning: string;
  tool: string;
  query: string;
};

export type State = {
  query: string;
  conversationHistory: string;
  tools: Tool[];
  actions: Action[];
  config: AgentConfig;
  nextMove: NextPlannedAction | null;
  runId: string;
  currentIteration: number;
};
