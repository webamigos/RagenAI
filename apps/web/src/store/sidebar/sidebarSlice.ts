import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  type ProjectType,
  type ThreadType,
} from '@/app/components/Sidebar/Projects/types';

export type SidebarState = {
  projects: ProjectType[];
};

const initialState: SidebarState = {
  projects: [],
};

export const sidebarSlice = createSlice({
  name: 'sidebar',
  initialState,
  reducers: {
    setProjects: (state, action: PayloadAction<ProjectType[]>) => {
      state.projects = action.payload;
    },
    addThreadToProject: (
      state,
      action: PayloadAction<{ projectId: string; thread: ThreadType }>,
    ) => {
      const { projectId, thread } = action.payload;
      const project = state.projects.find((p) => p.id === projectId);
      if (project) {
        const existingThreadIndex = project.threads.findIndex(
          (t) => t.id === thread.id,
        );
        if (existingThreadIndex === -1) {
          project.threads.unshift(thread);
        }
      }
    },
  },
});

export const { setProjects, addThreadToProject } = sidebarSlice.actions;

export default sidebarSlice.reducer;
