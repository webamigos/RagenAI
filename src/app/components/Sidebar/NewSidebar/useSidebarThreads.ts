'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useUser } from '@/app/hooks/use-auth';
import { useActiveOrganization } from '@/app/hooks/use-better-auth';
import { getSidebarThreads, toggleThreadStarred } from '@/app/actions';
import { logger } from '@/app/lib/utils/logger';
import type { SidebarThreadItem } from '@/features/threads/contracts/thread.types';

const RECENT_LIMIT = 20;

// Lightweight event bus for sidebar thread updates
type SidebarThreadEvent = { type: 'thread-created'; thread: SidebarThreadItem };
type Listener = (event: SidebarThreadEvent) => void;
const listeners = new Set<Listener>();

export const sidebarThreadEvents = {
  emit(event: SidebarThreadEvent) {
    listeners.forEach((fn) => fn(event));
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export const useSidebarThreads = () => {
  const { user } = useUser();
  const { data: activeOrg } = useActiveOrganization();
  const activeOrgId = activeOrg?.id;
  const [starredThreads, setStarredThreads] = useState<SidebarThreadItem[]>([]);
  const [recentThreads, setRecentThreads] = useState<SidebarThreadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [recentSkip, setRecentSkip] = useState(0);
  const fetchedRef = useRef(false);
  const prevOrgIdRef = useRef<string | undefined>(undefined);

  const fetchThreads = useCallback(
    async (skip = 0, append = false) => {
      if (!user?.id) {
        return;
      }
      setIsLoading(true);
      try {
        const result = await getSidebarThreads(user.id, RECENT_LIMIT, skip);
        setStarredThreads(result.starred as SidebarThreadItem[]);
        if (append) {
          setRecentThreads((prev) => [
            ...prev,
            ...(result.recent as SidebarThreadItem[]),
          ]);
        } else {
          setRecentThreads(result.recent as SidebarThreadItem[]);
        }
        setHasMore(result.hasMore);
      } catch (error) {
        logger.error({ error }, 'Failed to fetch sidebar threads');
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id],
  );

  // Reset and refetch when organization changes
  useEffect(() => {
    if (activeOrgId !== prevOrgIdRef.current) {
      // Only clear state when switching between orgs (not initial load)
      if (prevOrgIdRef.current !== undefined) {
        setStarredThreads([]);
        setRecentThreads([]);
        setRecentSkip(0);
        setHasMore(false);
      }
      fetchedRef.current = false;
      prevOrgIdRef.current = activeOrgId;
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (user?.id && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchThreads(0);
    }
  }, [user?.id, fetchThreads, activeOrgId]);

  // Listen for new thread creation events
  useEffect(() => {
    return sidebarThreadEvents.subscribe((event) => {
      if (event.type === 'thread-created') {
        setRecentThreads((prev) => {
          // Avoid duplicates
          if (prev.some((t) => t.public_id === event.thread.public_id)) {
            return prev;
          }
          return [event.thread, ...prev];
        });
      }
    });
  }, []);

  const loadMore = useCallback(async () => {
    const nextSkip = recentSkip + RECENT_LIMIT;
    setRecentSkip(nextSkip);
    await fetchThreads(nextSkip, true);
  }, [recentSkip, fetchThreads]);

  const toggleStar = useCallback(
    async (threadPublicId: string, isStarred: boolean) => {
      // Optimistic update
      const updateThread = (thread: SidebarThreadItem): SidebarThreadItem =>
        thread.public_id === threadPublicId
          ? { ...thread, is_starred: isStarred }
          : thread;

      if (isStarred) {
        // Moving from recent to starred
        const thread = recentThreads.find(
          (t) => t.public_id === threadPublicId,
        );
        if (thread) {
          const updated = { ...thread, is_starred: true };
          setStarredThreads((prev) => [updated, ...prev]);
          setRecentThreads((prev) =>
            prev.filter((t) => t.public_id !== threadPublicId),
          );
        } else {
          // Thread might be in starred already (shouldn't happen, but be safe)
          setStarredThreads((prev) => prev.map(updateThread));
        }
      } else {
        // Moving from starred to recent
        const thread = starredThreads.find(
          (t) => t.public_id === threadPublicId,
        );
        if (thread) {
          const updated = { ...thread, is_starred: false };
          setStarredThreads((prev) =>
            prev.filter((t) => t.public_id !== threadPublicId),
          );
          setRecentThreads((prev) => [updated, ...prev]);
        }
      }

      try {
        const result = await toggleThreadStarred(threadPublicId, isStarred);
        if (!result.success) {
          // Revert on failure
          fetchThreads(0);
        }
      } catch {
        fetchThreads(0);
      }
    },
    [starredThreads, recentThreads, fetchThreads],
  );

  const renameThread = useCallback(
    (threadPublicId: string, newTitle: string) => {
      const update = (t: SidebarThreadItem): SidebarThreadItem =>
        t.public_id === threadPublicId ? { ...t, title: newTitle } : t;
      setStarredThreads((prev) => prev.map(update));
      setRecentThreads((prev) => prev.map(update));
    },
    [],
  );

  const removeThread = useCallback((threadPublicId: string) => {
    setStarredThreads((prev) =>
      prev.filter((t) => t.public_id !== threadPublicId),
    );
    setRecentThreads((prev) =>
      prev.filter((t) => t.public_id !== threadPublicId),
    );
  }, []);

  const refetch = useCallback(() => {
    setRecentSkip(0);
    fetchedRef.current = false;
    fetchThreads(0);
  }, [fetchThreads]);

  return {
    starredThreads,
    recentThreads,
    isLoading,
    hasMore,
    loadMore,
    toggleStar,
    renameThread,
    removeThread,
    refetch,
  };
};
