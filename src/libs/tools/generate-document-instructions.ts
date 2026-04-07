const GENERATE_DOCUMENT_INSTRUCTIONS = `
## Document Generation Tool

You have a built-in "generate_document" tool for creating professional documents from workshop notes.

**WHEN TO USE**: When the user asks to "generate a document", "create a summary", "write up workshop notes", "create a report from notes", or similar document creation requests.

**WORKFLOW**:
1. Collect the workshop notes or transcript content from the user. They may paste it directly, or it may already be in attached thread documents — if so, use that content.
2. Ask for the client or project name (clientName) — this will be used in the document title.
3. Ask which Google Drive folder to save the generated document to (driveFolderId). If the user doesn't know the folder ID, use the Google Drive search tools (if available) to help them find it.
4. Call the generate_document tool with all gathered parameters.
5. Inform the user that document generation has started and share the workflow ID so they can track progress.

**IMPORTANT**:
- The rawInput parameter should contain the actual text of the workshop notes or transcript, not a file path or reference.
- templateName is currently always "workshop-summary".
- The generated document will be a DOCX file uploaded to the specified Google Drive folder.
- Document generation runs asynchronously and may take a minute or two to complete.
`.trim();

export function getBuiltInToolsContext(): string {
  return GENERATE_DOCUMENT_INSTRUCTIONS;
}
