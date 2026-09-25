/**
 * What the model may do on each step of a turn.
 *
 * Found by using it: a turn that spent every step reading ended with no
 * answer at all — eight tool calls and an empty bubble, because the loop
 * stopped on the step limit before the model wrote a word. So the last step
 * is always an answer, and the one before it may still propose a change
 * (a proposal needs a step after it to say so) but not read any more.
 *
 * `stepNumber` is the AI SDK's: 0 for the first step.
 */
export function stepPolicy(
  stepNumber: number,
  maxSteps: number,
  canWrite: boolean,
): { toolChoice: 'none' } | { activeTools: 'proposeChange'[] } | undefined {
  if (stepNumber >= maxSteps - 1) {
    return { toolChoice: 'none' };
  }
  if (stepNumber === maxSteps - 2) {
    return canWrite
      ? { activeTools: ['proposeChange'] }
      : { toolChoice: 'none' };
  }
  return undefined;
}
