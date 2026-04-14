type QdrantMetadataCondition =
  | { key: string; match: { value: string } }
  | { key: string; match_any: { values: string[] } };

export type ChatbotMetadataFilter = { must: QdrantMetadataCondition[] };

/**
 * Build the RAG metadata filter for a public chatbot visitor.
 *
 * Visitors are anonymous and must never reach documents that were
 * shared privately to specific users or teams. When the chatbot
 * operator has picked an explicit file list via `selectedFileIds`,
 * we trust that choice (the operator is opting those files in for
 * public access). When empty, we restrict to org-wide documents via
 * `metadata.accessible_by` — matching the non-admin path in
 * `buildMetadataFilter` in initializeBasicRag.
 */
export const buildChatbotMetadataFilter = (
  organizationId: string,
  selectedFileIds: readonly string[],
): ChatbotMetadataFilter => ({
  must: [
    { key: 'metadata.organization_id', match: { value: organizationId } },
    ...(selectedFileIds.length > 0
      ? [
          {
            key: 'metadata.file_id',
            match_any: { values: [...selectedFileIds] },
          },
        ]
      : [
          {
            key: 'metadata.accessible_by',
            match_any: { values: [`org:${organizationId}`] },
          },
        ]),
  ],
});
