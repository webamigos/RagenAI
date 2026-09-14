/**
 * Shape of the `runtimeContext` payload threaded through `streamText`
 * so MCP tool wrappers can decide whether to pause a write tool and wait
 * for user confirmation (Phase 2 of the prompt-injection defense plan).
 *
 * Producers (assistant-stream.ts → basic-rag/chain.ts → streamText):
 *   - set `ragContextPresent = true` when the turn includes retrieved
 *     chunks from the knowledge base. This is the exfiltration vector
 *     we're closing — untrusted document content + a side-effect tool.
 *   - set `approvedToolCalls` to the list of `toolCallId`s the user has
 *     already signed off on (empty in Phase 2a — no re-entry flow yet).
 *
 * Consumer (wrapToolsForConnector in src/libs/mcp/client.ts):
 *   - reads `runtimeContext` inside each write tool's
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
  runtimeContext: unknown,
): ToolGatingContext | null {
  if (!runtimeContext || typeof runtimeContext !== 'object') {
    return null;
  }
  const ctx = runtimeContext as Partial<ToolGatingContext>;
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
 *   1. Missing or malformed context → `true` (**fail closed**, see below)
 *   2. `ragContextPresent === false` → `false` (no exfil vector today)
 *   3. `toolCallId` in `approvedToolCalls` → `false` (user pre-approved)
 *   4. Otherwise → `true` (pause and wait for user confirmation)
 *
 * **Rule 1 was `false` until the AI SDK 7 upgrade, and that was the risk.**
 * The context used to arrive as `experimental_context`, a field AI SDK 7
 * removed; it is `runtimeContext` now. Under the old rule, any future change
 * that stopped threading it — a rename like this one, a refactor, a new caller
 * — would have silently ungated every write tool while RAG content was in the
 * prompt, which is precisely the exfiltration path this gate exists to close.
 * `undefined` is a valid `unknown`, so nothing would have failed to compile and
 * no test asserting a gated call would have been written for the caller that
 * forgot.
 *
 * The cost of failing closed is a caller that legitimately has no RAG content
 * being asked to confirm a write. That is why every caller now threads a
 * context explicitly, including the conversation chain, which says
 * `ragContextPresent: false` rather than saying nothing.
 */
export function shouldPauseForApproval(
  runtimeContext: unknown,
  toolCallId: string,
): boolean {
  const gating = readToolGatingContext(runtimeContext);
  if (!gating) {
    // Fail closed. A caller wiring write tools without a gating context is a
    // programming error, not a non-RAG flow — the non-RAG flows say so.
    return true;
  }
  if (!gating.ragContextPresent) {
    return false;
  }
  if (gating.approvedToolCalls.includes(toolCallId)) {
    return false;
  }
  return true;
}
