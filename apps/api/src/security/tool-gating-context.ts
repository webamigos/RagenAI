/**
 * Ported verbatim from ragen-app's src/libs/security/tool-gating-context.ts
 * — pure logic, no imports in the original. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Shape of the `experimental_context` payload threaded through `streamText`
 * so MCP tool wrappers can decide whether to pause a write tool and wait
 * for user confirmation (Phase 2 of the prompt-injection defense plan).
 *
 * Producers (basic-rag/chain.ts → streamText):
 *   - set `ragContextPresent = true` when the turn includes retrieved
 *     chunks from the knowledge base. This is the exfiltration vector
 *     we're closing — untrusted document content + a side-effect tool.
 *   - set `approvedToolCalls` to the list of `toolCallId`s the user has
 *     already signed off on (empty in Phase 2a — no re-entry flow yet).
 *
 * Consumer (wrapToolsForConnector in ../mcp/client.ts):
 *   - reads `experimental_context` inside each write-tool's
 *     `needsApproval` predicate. If context is missing entirely we
 *     treat it as "not gated" — a caller that doesn't thread the
 *     context is assumed to be a non-RAG flow and tool execution
 *     proceeds normally.
 */
export type ToolGatingContext = {
  ragContextPresent: boolean;
  approvedToolCalls: readonly string[];
};

/**
 * Narrowing helper so callsites don't have to repeat the unsafe cast
 * from `unknown`.
 */
export function readToolGatingContext(
  experimentalContext: unknown,
): ToolGatingContext | null {
  if (!experimentalContext || typeof experimentalContext !== 'object') {
    return null;
  }
  const ctx = experimentalContext as Partial<ToolGatingContext>;
  if (typeof ctx.ragContextPresent !== 'boolean') {
    return null;
  }
  return {
    ragContextPresent: ctx.ragContextPresent,
    approvedToolCalls: Array.isArray(ctx.approvedToolCalls)
      ? ctx.approvedToolCalls
      : [],
  };
}

/**
 * The core gating decision — factored out of `wrapToolsForConnector`
 * so it can be unit-tested in isolation. Returns `true` when the tool
 * call should be paused for user approval.
 *
 * Rules (in order):
 *   1. Missing or malformed context → `false` (non-RAG flow, pass through)
 *   2. `ragContextPresent === false` → `false` (no exfil vector today)
 *   3. `toolCallId` in `approvedToolCalls` → `false` (user pre-approved)
 *   4. Otherwise → `true` (pause and wait for user confirmation)
 */
export function shouldPauseForApproval(
  experimentalContext: unknown,
  toolCallId: string,
): boolean {
  const gating = readToolGatingContext(experimentalContext);
  if (!gating) {
    return false;
  }
  if (!gating.ragContextPresent) {
    return false;
  }
  if (gating.approvedToolCalls.includes(toolCallId)) {
    return false;
  }
  return true;
}
