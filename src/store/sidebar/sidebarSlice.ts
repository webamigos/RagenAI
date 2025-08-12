import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import {
  type ProjectType,
  type ThreadType,
} from '@/app/components/Sidebar/Projects/types';

export type SidebarState = {
  isOpen: boolean;
  activeThread: string | undefined;
  projects: ProjectType[];
  searchQuery: string;
  isCreateModalOpen: boolean;
};

const initialState: SidebarState = {
  isOpen: false,
  activeThread: undefined,
  projects: [],
  searchQuery: '',
  isCreateModalOpen: false,
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
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setCreateModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isCreateModalOpen = action.payload;
    },
    addThreadToProject: (
      state,
      action: PayloadAction<{ projectId: number; thread: ThreadType }>
    ) => {
      const { projectId, thread } = action.payload;
      const project = state.projects.find((p) => (p as any).id === projectId);
      if (project) {
        const existingThreadIndex = project.threads.findIndex(
          (t) => t.public_id === thread.public_id
        );
        if (existingThreadIndex === -1) {
          project.threads.unshift(thread);
        }
      }
    },
  },
});

export const {
  toggleSidebar,
  openSidebar,
  closeSidebar,
  setActiveThread,
  setProjects,
  setSearchQuery,
  setCreateModalOpen,
  addThreadToProject,
} = sidebarSlice.actions;

export default sidebarSlice.reducer;
