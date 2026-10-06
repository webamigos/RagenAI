import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  project: vi.fn(),
  permission: vi.fn(),
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    member: { findFirst: mocks.member },
    project: { findFirst: mocks.project },
  },
}));
vi.mock(
  '@/features/projects/services/queries/resolve-project-permission-for-member',
  () => ({ resolveProjectPermissionForMember: mocks.permission }),
);
import { getMcpConnectionLabels } from '../get-mcp-connection-labels-query';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.member.mockResolvedValue({
    role: 'member',
    organization: { name: 'Workspace' },
  });
  mocks.permission.mockResolvedValue({ canView: false });
});
it('does not fetch a private assistant name without view permission', async () => {
  expect(await getMcpConnectionLabels('user', 'org:project')).toEqual({
    organizationName: 'Workspace',
    assistantName: null,
  });
  expect(mocks.permission).toHaveBeenCalledWith(
    'project',
    'org',
    'user',
    'member',
  );
  expect(mocks.project).not.toHaveBeenCalled();
});
it('returns accessible assistant names from the chosen organization', async () => {
  mocks.permission.mockResolvedValue({ canView: true });
  mocks.project.mockResolvedValue({ title: 'Assistant' });
  expect(await getMcpConnectionLabels('user', 'org:project')).toEqual({
    organizationName: 'Workspace',
    assistantName: 'Assistant',
  });
  expect(mocks.project).toHaveBeenCalledWith({
    where: { id: 'project', organizationId: 'org', isArchived: false },
    select: { title: true },
  });
});
it('does not expose a workspace after membership removal', async () => {
  mocks.member.mockResolvedValue(null);
  expect(await getMcpConnectionLabels('user', 'org:project')).toEqual({
    organizationName: null,
    assistantName: null,
  });
  expect(mocks.permission).not.toHaveBeenCalled();
});
