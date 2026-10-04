/**
 * Whether an assistant answers only from its documents.
 *
 * `ProjectSettings.answerFromDocumentsOnly` is a nullable column: `true` and
 * `false` are what an admin set on the assistant settings page, and `null`
 * means nobody has, so the surface decides. A project with the public chatbot
 * enabled defaults to strict, because there a general-knowledge answer reads
 * as the company's answer to a visitor; everywhere else keeps the rule that
 * lets the model answer from its own knowledge and say so (spec
 * 2026-10-03-retrieval-claims-match-the-product-before-launch, Q3).
 *
 * It lives here because apps/web and apps/api both build the answer prompt,
 * and two copies of a default are the drift ADR-33 exists to prevent.
 */
export type AnswerFromDocumentsOnlyInput = {
  /** The stored column. `null`/`undefined`: no row, or nobody set it. */
  setting: boolean | null | undefined;
  /** `Project.chatbotEnabled`. */
  chatbotEnabled: boolean;
};

export function resolveAnswerFromDocumentsOnly({
  setting,
  chatbotEnabled,
}: AnswerFromDocumentsOnlyInput): boolean {
  if (setting === true || setting === false) {
    return setting;
  }
  return chatbotEnabled;
}
