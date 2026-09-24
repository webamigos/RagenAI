/**
 * The system instruction that tells the model how to treat chat-time PII
 * placeholders — and, as importantly, when not to send it at all.
 *
 * It used to be appended to every prompt, masked or not, with a list of
 * example tokens (`<PL_PHONE_1>`, `<PL_NIP_1>`, …). On a turn where nothing
 * had been masked, the model read a real phone number in the retrieved
 * context beside an instruction describing `<PL_PHONE_1>` and wrote the token
 * instead of the number. An instruction that describes a token format teaches
 * the model to produce that format; it belongs only on a turn that actually
 * contains such tokens.
 *
 * Lists the placeholders that are really in the question, not examples, so the
 * model has no template to invent from.
 */
export function buildPiiSystemInstruction(
  aliasMap: Record<string, string>,
): string | null {
  const placeholders = Object.keys(aliasMap);
  if (placeholders.length === 0) {
    return null;
  }

  return [
    "Some personal data in the user's message was replaced with placeholders " +
      `before it reached you: ${placeholders.join(', ')}.`,
    'When you refer to that data in your answer or in tool arguments, copy the ' +
      'placeholder exactly as written — do not paraphrase it, describe it, or ' +
      'replace it with other text.',
    'Use only the placeholders listed here. Never write a token for data you ' +
      'can read in the context: if the context shows a phone number, an e-mail ' +
      'address or any other value, quote that value as it appears.',
  ].join(' ');
}

/**
 * The organization's answer instructions with the PII instruction appended
 * when — and only when — the question was masked.
 *
 * Returns `prompt` untouched for an unmasked turn, including an empty one, so
 * each chain's own default answer instructions still apply: the chains fall
 * back to them only on an empty prompt, and the unconditional instruction used
 * to fill that slot on every turn.
 */
export function withPiiSystemInstruction(
  prompt: string,
  aliasMap: Record<string, string>,
): string {
  const instruction = buildPiiSystemInstruction(aliasMap);
  if (!instruction) {
    return prompt;
  }
  return prompt ? `${prompt}\n\n${instruction}` : instruction;
}
