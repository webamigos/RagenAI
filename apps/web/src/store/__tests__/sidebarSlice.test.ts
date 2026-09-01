import { describe, it, expect } from 'vitest';
import sidebarReducer, {
  setProjects,
  addThreadToProject,
  type SidebarState,
} from '../sidebar/sidebarSlice';

const initialState: SidebarState = {
  projects: [],
};

const mockThread = {
  createdAt: '2026-03-25T10:00:00Z',
  id: 'thread-1',
  visitorId: 'user-1',
  preferredCommunicationType: 'TEXT' as const,
  projectId: 'proj-1',
  preferredModel: null,
  messages: [{ content: 'Hello' }],
};

const mockProjects = [
  {
    createdAt: '2026-03-20T10:00:00Z',
    id: 'proj-1',
    title: 'Project A',
    threads: [mockThread],
  },
  {
    createdAt: '2026-03-21T10:00:00Z',
    id: 'proj-2',
    title: 'Project B',
    threads: [],
  },
];

describe('sidebarSlice', () => {
  it('returns initial state', () => {
    expect(sidebarReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  describe('setProjects', () => {
    it('sets projects array', () => {
      const state = sidebarReducer(initialState, setProjects(mockProjects));
      expect(state.projects).toHaveLength(2);
      expect(state.projects[0].title).toBe('Project A');
    });

    it('replaces existing projects', () => {
      const withProjects = { ...initialState, projects: mockProjects };
      const newProjects = [
        {
          createdAt: '2026-03-25T10:00:00Z',
          id: 'proj-3',
          title: 'Project C',
          threads: [],
        },
      ];
      const state = sidebarReducer(withProjects, setProjects(newProjects));
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].title).toBe('Project C');
    });
  });

  describe('addThreadToProject', () => {
    it('adds thread to matching project', () => {
      const withProjects = { ...initialState, projects: mockProjects } as any;

      const newThread = {
        ...mockThread,
        id: 'thread-new',
        messages: [{ content: 'New message' }],
      };

      const state = sidebarReducer(
        withProjects,
        addThreadToProject({ projectId: 'proj-1', thread: newThread }),
      );

      expect(state.projects[0].threads).toHaveLength(2);
      expect(state.projects[0].threads[0].id).toBe('thread-new');
    });

    it('does not add duplicate thread', () => {
      const withProjects = { ...initialState, projects: mockProjects } as any;

      const state = sidebarReducer(
        withProjects,
        addThreadToProject({ projectId: 'proj-1', thread: mockThread }),
      );

      expect(state.projects[0].threads).toHaveLength(1);
    });

    it('does nothing when project is not found', () => {
      const withProjects = { ...initialState, projects: mockProjects } as any;

      const state = sidebarReducer(
        withProjects,
        addThreadToProject({ projectId: 'proj-999', thread: mockThread }),
      );

      expect(state.projects).toEqual(withProjects.projects);
    });
  });
});
