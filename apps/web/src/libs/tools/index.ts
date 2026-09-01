import { createGenerateDocumentTool } from './generate-document-tool';

export { getBuiltInToolsContext } from './generate-document-instructions';

type BuiltInToolsContext = {
  orgId: string;
  userId: string;
  userEmail: string;
};

export function createBuiltInTools(
  ctx: BuiltInToolsContext,
): Record<string, any> {
  return {
    generate_document: createGenerateDocumentTool(ctx),
  };
}
