import { DocumentsTableSkeleton } from '@/app/components/ManageKnowledge/UserFiles/FileList/DocumentsTableSkeleton';

export default function DocumentsListLoading() {
  return (
    <div className="flex gap-3 pb-5">
      {/* Sidebar skeleton */}
      <div className="hidden lg:block w-56 shrink-0 border-r border-border pr-2">
        <div className="flex flex-col gap-2 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-full animate-pulse rounded bg-paper-200 dark:bg-paper-700"
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Breadcrumbs skeleton */}
        <div className="mb-2 h-5 w-40 animate-pulse rounded bg-paper-200 dark:bg-paper-700" />

        {/* Top bar skeleton: search + layout toggle + spacer + Nowy folder + Dodaj dokument */}
        <div className="mb-3 flex shrink-0 items-center gap-3">
          <div className="h-9 w-52 animate-pulse rounded-md bg-paper-200 dark:bg-paper-700" />
          <div className="hidden md:block h-9 w-[72px] animate-pulse rounded-md bg-paper-200 dark:bg-paper-700" />
          <div className="flex-1" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-paper-200 dark:bg-paper-700" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-paper-200 dark:bg-paper-700" />
        </div>

        {/* Filters bar skeleton: sort dropdown + file type filter + status filter */}
        <div className="mb-3 flex items-center gap-2">
          <div className="h-8 w-36 animate-pulse rounded-md bg-paper-200 dark:bg-paper-700" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-paper-200 dark:bg-paper-700" />
          <div className="h-8 w-24 animate-pulse rounded-md bg-paper-200 dark:bg-paper-700" />
        </div>

        <DocumentsTableSkeleton />
      </div>
    </div>
  );
}
