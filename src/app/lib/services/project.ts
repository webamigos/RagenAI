'use server';

// --- Re-exports from @/features/projects ---

/** @deprecated Use getDefaultProjectIdQuery from @/features/projects instead */
export { getDefaultProjectIdQuery as fetchOrganizationDefaultProjectId } from '@/features/projects/services/queries/get-default-project-query';

/** @deprecated Use getDefaultProjectPublicIdQuery from @/features/projects instead */
export { getDefaultProjectPublicIdQuery as fetchOrganizationDefaultProjectPublicId } from '@/features/projects/services/queries/get-default-project-query';

/** @deprecated Use createProjectCommand from @/features/projects instead */
export { createProjectCommand as createProjectForOrganization } from '@/features/projects/services/commands/create-project-command';

/** @deprecated Use getUserProjectsQuery from @/features/projects instead */
export { getUserProjectsQuery as fetchProjectsForUser } from '@/features/projects/services/queries/get-user-projects-query';

/** @deprecated Use getProjectByPublicIdQuery from @/features/projects instead */
export { getProjectByPublicIdQuery as getProjectByPublicId } from '@/features/projects/services/queries/get-project-query';

/** @deprecated Use getProjectByPublicIdOrThrowQuery from @/features/projects instead */
export { getProjectByPublicIdOrThrowQuery as getProjectByPublicIdOrThrow } from '@/features/projects/services/queries/get-project-query';

/** @deprecated Use getPublicProjectQuery from @/features/projects instead */
export { getPublicProjectQuery as getPublicProject } from '@/features/projects/services/queries/get-project-query';

/** @deprecated Use generateProjectKeyCommand from @/features/projects instead */
export { generateProjectKeyCommand as generateProjectKey } from '@/features/projects/services/commands/generate-project-key-command';

/** @deprecated Use disablePublicAccessCommand from @/features/projects instead */
export { disablePublicAccessCommand as disablePublicAccessForProject } from '@/features/projects/services/commands/disable-public-access-command';

/** @deprecated Use toggleChatbotCommand from @/features/projects instead */
export { toggleChatbotCommand as toggleChatbotEnabled } from '@/features/projects/services/commands/toggle-chatbot-command';

/** @deprecated Use getProjectFilesQuery from @/features/documents instead */
export { getProjectFilesQuery as fetchProjectFiles } from '@/features/documents/services/queries/get-project-files-query';

/** @deprecated Use deleteProjectFileFromDbCommand from @/features/documents instead */
export { deleteProjectFileFromDbCommand as deleteProjectFile } from '@/features/documents/services/commands/delete-project-file-from-db-command';

/** @deprecated Use findInternalOrganizationQuery from @/features/organizations instead */
export { findInternalOrganizationQuery as findOrganizationByProviderId } from '@/features/organizations/services/queries/find-internal-organization-query';
