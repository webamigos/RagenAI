import { describe, it, expect } from 'vitest';
import threadsReducer, {
  setLoading,
  setThreadLoading,
  setThreadsLoaded,
  setUserThreads,
  setError,
  addThreads,
  addThread,
  setHasMore,
  incrementSkip,
  resetThreads,
  setCurrentThreadId,
  setDefaultProjectId,
  updateThreadModel,
  type ThreadState,
} from '../threads/threadsSlice';

const initialState: ThreadState = {
  userThreads: [],
  error: null,
  isLoading: false,
  isThreadLoading: false,
  isThreadsLoaded: false,
  skip: 0,
  hasMore: true,
  currentThreadId: '',
  defaultProjectId: null,
};

const mockThread = {
  id: 'thread-1',
  messages: [{ content: 'Hello', role: 'user' as const }],
  projectId: 'proj-1',
  createdAt: '2026-03-25T10:00:00Z',
  preferredModel: null,
};

const mockThread2 = {
  id: 'thread-2',
  messages: [{ content: 'World', role: 'user' as const }],
  projectId: 'proj-2',
  createdAt: '2026-03-24T10:00:00Z',
  preferredModel: null,
};

describe('threadsSlice', () => {
  it('returns initial state', () => {
    expect(threadsReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  describe('setLoading', () => {
    it('sets loading to true and clears error', () => {
      const withError = {
        ...initialState,
        error: { status: 500, message: 'Server error' },
      };
      const state = threadsReducer(withError, setLoading(true));
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('sets loading to false without clearing error', () => {
      const withError = {
        ...initialState,
        isLoading: true,
        error: { status: 500, message: 'Error' },
      };
      const state = threadsReducer(withError, setLoading(false));
      expect(state.isLoading).toBe(false);
      expect(state.error).not.toBeNull();
    });
  });

  describe('setThreadLoading', () => {
    it('sets thread loading state', () => {
      const state = threadsReducer(initialState, setThreadLoading(true));
      expect(state.isThreadLoading).toBe(true);
    });
  });

  describe('setThreadsLoaded', () => {
    it('sets threads loaded state', () => {
      const state = threadsReducer(initialState, setThreadsLoaded(true));
      expect(state.isThreadsLoaded).toBe(true);
    });
  });

  describe('setUserThreads', () => {
    it('sets user threads and marks loaded', () => {
      const threads = [mockThread, mockThread2] as any;
      const state = threadsReducer(
        { ...initialState, isLoading: true },
        setUserThreads(threads),
      );
      expect(state.userThreads).toHaveLength(2);
      expect(state.isLoading).toBe(false);
      expect(state.isThreadsLoaded).toBe(true);
      expect(state.hasMore).toBe(true);
    });

    it('sets hasMore to false when empty array', () => {
      const state = threadsReducer(initialState, setUserThreads([]));
      expect(state.userThreads).toHaveLength(0);
      expect(state.hasMore).toBe(false);
    });

    it('handles null/undefined payload gracefully', () => {
      const state = threadsReducer(
        initialState,
        setUserThreads(undefined as any),
      );
      expect(state.userThreads).toEqual([]);
      expect(state.hasMore).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets error and stops loading', () => {
      const loading = { ...initialState, isLoading: true };
      const state = threadsReducer(
        loading,
        setError({ status: 404, message: 'Not found' }),
      );
      expect(state.error).toEqual({ status: 404, message: 'Not found' });
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addThreads', () => {
    it('appends new threads without duplicates', () => {
      const withThreads = {
        ...initialState,
        userThreads: [mockThread] as any,
      };
      const state = threadsReducer(
        withThreads,
        addThreads([mockThread2] as any),
      );
      expect(state.userThreads).toHaveLength(2);
      expect(state.isThreadsLoaded).toBe(true);
    });

    it('filters out duplicate threads', () => {
      const withThreads = {
        ...initialState,
        userThreads: [mockThread] as any,
      };
      const state = threadsReducer(
        withThreads,
        addThreads([mockThread, mockThread2] as any),
      );
      // mockThread is duplicate, only mockThread2 is added
      expect(state.userThreads).toHaveLength(2);
    });

    it('stops loading after adding', () => {
      const loading = {
        ...initialState,
        isLoading: true,
      };
      const state = threadsReducer(loading, addThreads([]));
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addThread', () => {
    it('prepends new thread', () => {
      const withThreads = {
        ...initialState,
        userThreads: [mockThread] as any,
      };
      const state = threadsReducer(withThreads, addThread(mockThread2 as any));
      expect(state.userThreads).toHaveLength(2);
      expect(state.userThreads[0].id).toBe('thread-2');
    });

    it('updates existing thread instead of duplicating', () => {
      const withThreads = {
        ...initialState,
        userThreads: [mockThread] as any,
      };
      const updatedThread = {
        ...mockThread,
        messages: [{ content: 'Updated', role: 'user' as const }],
        projectId: 'proj-5',
      };
      const state = threadsReducer(
        withThreads,
        addThread(updatedThread as any),
      );
      expect(state.userThreads).toHaveLength(1);
      expect(state.userThreads[0].messages[0].content).toBe('Updated');
      expect(state.userThreads[0].projectId).toBe('proj-5');
    });
  });

  describe('setHasMore', () => {
    it('sets hasMore flag', () => {
      const state = threadsReducer(initialState, setHasMore(false));
      expect(state.hasMore).toBe(false);
    });
  });

  describe('incrementSkip', () => {
    it('increments skip by the given amount', () => {
      const state = threadsReducer(initialState, incrementSkip(10));
      expect(state.skip).toBe(10);
    });

    it('accumulates skip values', () => {
      let state = threadsReducer(initialState, incrementSkip(10));
      state = threadsReducer(state, incrementSkip(5));
      expect(state.skip).toBe(15);
    });
  });

  describe('resetThreads', () => {
    it('resets threads, skip, hasMore, and isThreadsLoaded', () => {
      const modified: ThreadState = {
        ...initialState,
        userThreads: [mockThread] as any,
        skip: 20,
        hasMore: false,
        isThreadsLoaded: true,
        currentThreadId: 'thread-1',
      };
      const state = threadsReducer(modified, resetThreads());
      expect(state.userThreads).toEqual([]);
      expect(state.skip).toBe(0);
      expect(state.hasMore).toBe(true);
      expect(state.isThreadsLoaded).toBe(false);
      // currentThreadId is NOT reset
      expect(state.currentThreadId).toBe('thread-1');
    });
  });

  describe('setCurrentThreadId', () => {
    it('sets current thread ID', () => {
      const state = threadsReducer(
        initialState,
        setCurrentThreadId('thread-abc'),
      );
      expect(state.currentThreadId).toBe('thread-abc');
    });
  });

  describe('setDefaultProjectId', () => {
    it('sets default project ID', () => {
      const state = threadsReducer(
        initialState,
        setDefaultProjectId('proj-default'),
      );
      expect(state.defaultProjectId).toBe('proj-default');
    });

    it('clears default project with null', () => {
      const withDefault = {
        ...initialState,
        defaultProjectId: 'proj-default',
      };
      const state = threadsReducer(withDefault, setDefaultProjectId(null));
      expect(state.defaultProjectId).toBeNull();
    });
  });

  describe('updateThreadModel', () => {
    it('updates model on matching thread', () => {
      const withThreads = {
        ...initialState,
        userThreads: [mockThread] as any,
      };
      const state = threadsReducer(
        withThreads,
        updateThreadModel({ threadId: 'thread-1', model: 'claude-3' }),
      );
      expect(state.userThreads[0].preferredModel).toBe('claude-3');
    });

    it('does nothing when thread not found', () => {
      const withThreads = {
        ...initialState,
        userThreads: [mockThread] as any,
      };
      const state = threadsReducer(
        withThreads,
        updateThreadModel({ threadId: 'nonexistent', model: 'claude-3' }),
      );
      expect(state.userThreads[0].preferredModel).toBeNull();
    });
  });
});
