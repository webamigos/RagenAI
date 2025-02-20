import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ThreadHistoryResponse } from '@/app/contracts/Message';
import { ProjectType } from '@/app/components/Sidebar/Projects/types';

export type SidebarThreadsFetchError = {
  status: number | null;
  message: string | null;
};

export type SidebarState = {
  isOpen: boolean;
  activeThread: string | undefined;
  projects: ProjectType[];
  threads: ThreadHistoryResponse[];
  searchQuery: string;
  isLoading: boolean;
  error: SidebarThreadsFetchError | null;
  isCreateModalOpen: boolean;
  isThreadLoading: boolean;
  hasMore: boolean;
  isThreadsLoaded: boolean;
};

const initialState: SidebarState = {
  isOpen: false,
  activeThread: undefined,
  projects: [],
  threads: [],
  searchQuery: '',
  isLoading: false,
  error: null,
  isCreateModalOpen: false,
  isThreadLoading: false,
  hasMore: false,
  isThreadsLoaded: false,
};

export const sidebarSlice = createSlice({
  name: 'sidebar',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.isOpen = !state.isOpen;
    },
    openSidebar: (state) => {
      state.isOpen = true;
    },
    closeSidebar: (state) => {
      state.isOpen = false;
    },
    setActiveThread: (state, action: PayloadAction<string | undefined>) => {
      state.activeThread = action.payload;
    },
    setProjects: (state, action: PayloadAction<ProjectType[]>) => {
      state.projects = action.payload;
    },
    setThreads: (state, action: PayloadAction<ThreadHistoryResponse[]>) => {
      state.threads = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (
      state,
      action: PayloadAction<SidebarThreadsFetchError | null>
    ) => {
      state.error = action.payload;
    },
    setCreateModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isCreateModalOpen = action.payload;
    },
    setThreadLoading: (state, action: PayloadAction<boolean>) => {
      state.isThreadLoading = action.payload;
    },
    setHasMore: (state, action: PayloadAction<boolean>) => {
      state.hasMore = action.payload;
    },
    setThreadsLoaded: (state, action: PayloadAction<boolean>) => {
      state.isThreadsLoaded = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  openSidebar,
  closeSidebar,
  setActiveThread,
  setProjects,
  setThreads,
  setSearchQuery,
  setLoading,
  setError,
  setCreateModalOpen,
  setThreadLoading,
  setHasMore,
  setThreadsLoaded,
} = sidebarSlice.actions;

export default sidebarSlice.reducer;
