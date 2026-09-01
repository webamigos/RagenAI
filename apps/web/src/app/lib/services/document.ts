// @deprecated — Import from @/features/documents/ instead

export { getDocumentByIdQuery as getDocumentById } from '@/features/documents/services/queries/get-document-query';

export { getDocumentByIdWithFileQuery as getDocumentByIdWithFile } from '@/features/documents/services/queries/get-document-query';

export { deleteDocumentFromDbCommand as deleteDocumentFromDb } from '@/features/documents/services/commands/update-document-command';

export { createDocumentCommand as createMarkdownDocument } from '@/features/documents/services/commands/create-document-command';

export { getDocumentPreviewQuery as getDocumentPreview } from '@/features/documents/services/queries/get-document-preview-query';

export {
  updateDocumentTitleCommand as saveEditedDocumentTitle,
  updateDocumentContentCommand as saveEditedDocumentContent,
} from '@/features/documents/services/commands/update-document-command';
