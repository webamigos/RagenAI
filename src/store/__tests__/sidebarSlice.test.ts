import { describe, it, expect } from 'vitest';
import sidebarReducer, {
  toggleSidebar,
  openSidebar,
  closeSidebar,
  setActiveThread,
  setProjects,
  setSearchQuery,
  setCreateModalOpen,
  addThreadToProject,
  updateThreadModel,
  type SidebarState,
} from '../sidebar/sidebarSlice';

const initialState: SidebarState = {
  isOpen: false,
  activeThread: undefined,
  projects: [],
  searchQuery: '',
  isCreateModalOpen: false,
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

  describe('toggleSidebar', () => {
    it('opens sidebar when closed', () => {
      const state = sidebarReducer(initialState, toggleSidebar());
      expect(state.isOpen).toBe(true);
    });

    it('closes sidebar when open', () => {
      const open = { ...initialState, isOpen: true };
      const state = sidebarReducer(open, toggleSidebar());
      expect(state.isOpen).toBe(false);
    });
  });

  describe('openSidebar', () => {
    it('sets isOpen to true', () => {
      const state = sidebarReducer(initialState, openSidebar());
      expect(state.isOpen).toBe(true);
    });
  });

  describe('closeSidebar', () => {
    it('sets isOpen to false', () => {
      const open = { ...initialState, isOpen: true };
      const state = sidebarReducer(open, closeSidebar());
      expect(state.isOpen).toBe(false);
    });
  });

  describe('setActiveThread', () => {
    it('sets active thread ID', () => {
      const state = sidebarReducer(initialState, setActiveThread('thread-abc'));
      expect(state.activeThread).toBe('thread-abc');
    });

    it('clears active thread with undefined', () => {
      const withThread = { ...initialState, activeThread: 'thread-abc' };
      const state = sidebarReducer(withThread, setActiveThread(undefined));
      expect(state.activeThread).toBeUndefined();
    });
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

  describe('setSearchQuery', () => {
    it('sets search query', () => {
      const state = sidebarReducer(initialState, setSearchQuery('test'));
      expect(state.searchQuery).toBe('test');
    });
  });

  describe('setCreateModalOpen', () => {
    it('opens create modal', () => {
      const state = sidebarReducer(initialState, setCreateModalOpen(true));
      expect(state.isCreateModalOpen).toBe(true);
    });

    it('closes create modal', () => {
      const open = { ...initialState, isCreateModalOpen: true };
      const state = sidebarReducer(open, setCreateModalOpen(false));
      expect(state.isCreateModalOpen).toBe(false);
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
      const withProjects = {
        ...initialState,
        projects: mockProjects,
      } as any;

      const state = sidebarReducer(
        withProjects,
        addThreadToProject({ projectId: 'proj-1', thread: mockThread }),
      );

      // Should still have just 1 thread (duplicate skipped)
      expect(state.projects[0].threads).toHaveLength(1);
    });

    it('does nothing when project is not found', () => {
      const withProjects = {
        ...initialState,
        projects: mockProjects,
      } as any;

      const state = sidebarReducer(
        withProjects,
        addThreadToProject({ projectId: 'proj-999', thread: mockThread }),
      );

      expect(state.projects).toEqual(withProjects.projects);
    });
  });

  describe('updateThreadModel', () => {
    it('updates thread model in matching project', () => {
      const withProjects = { ...initialState, projects: mockProjects };
      const state = sidebarReducer(
        withProjects,
        updateThreadModel({ threadId: 'thread-1', model: 'gpt-4o' }),
      );

      expect(state.projects[0].threads[0].preferredModel).toBe('gpt-4o');
    });

    it('sets model to null', () => {
      const withModel = {
        ...initialState,
        projects: [
          {
            ...mockProjects[0],
            threads: [{ ...mockThread, preferredModel: 'gpt-4o' }],
          },
        ],
      };

      const state = sidebarReducer(
        withModel,
        updateThreadModel({ threadId: 'thread-1', model: null }),
      );

      expect(state.projects[0].threads[0].preferredModel).toBeNull();
    });

    it('does nothing when thread is not found', () => {
      const withProjects = { ...initialState, projects: mockProjects };
      const state = sidebarReducer(
        withProjects,
        updateThreadModel({ threadId: 'nonexistent', model: 'gpt-4o' }),
      );

      expect(state.projects[0].threads[0].preferredModel).toBeNull();
    });
  });
});
