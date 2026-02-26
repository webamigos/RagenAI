'use client';

import { useSidebarCollapse } from '@ragenai/tui/sidebar-layout';

export const SidebarToggleButton = () => {
  const { toggle } = useSidebarCollapse();

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
      aria-label="Toggle sidebar"
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="w-5 h-5"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
};
