import { createGenerateDocumentTool } from './generate-document-tool';

export { getBuiltInToolsContext } from './generate-document-instructions';

type BuiltInToolsContext = {
  orgId: string;
  userId: string;
  userEmail: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBuiltInTools(
  ctx: BuiltInToolsContext,
): Record<string, any> {
  return {
    generate_document: createGenerateDocumentTool(ctx),
  };
}
