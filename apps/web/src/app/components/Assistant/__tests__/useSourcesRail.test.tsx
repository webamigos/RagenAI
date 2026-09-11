import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import assistantReducer, {
  type MessageRetrieval,
} from '@/store/assistant/assistantSlice';
import type { MessageDto } from '@/features/messages/contracts/message.types';
import { useLatestRetrieval, useSourcesRailOpen } from '../useSourcesRail';

const retrieval = (fileId: string): MessageRetrieval => ({
  sources: [{ fileId, fileName: `${fileId}.pdf`, chunkCount: 1 }],
  chunkCount: 1,
  durationMs: 10,
  citedFileIds: [],
});

const message = (id: string) => ({ id }) as MessageDto;

function withStore(preloaded: {
  retrievalByMessage?: Record<string, MessageRetrieval>;
  pendingRetrieval?: MessageRetrieval | null;
}) {
  const base = assistantReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: { assistant: assistantReducer },
    preloadedState: { assistant: { ...base, ...preloaded } },
  });
  function StoreWrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  return StoreWrapper;
}

describe('useLatestRetrieval', () => {
  it('has nothing to show when no turn in the thread searched', () => {
    const { result } = renderHook(() => useLatestRetrieval([message('m1')]), {
      wrapper: withStore({}),
    });

    expect(result.current).toBeUndefined();
  });

  /**
   * The `retrieval` event is sent before the first token, so the rail fills in
   * as the answer arrives rather than snapping into place after it. A turn in
   * flight is by definition newer than anything already filed by id.
   */
  it('prefers the turn in flight over the last finished one', () => {
    const { result } = renderHook(() => useLatestRetrieval([message('m1')]), {
      wrapper: withStore({
        retrievalByMessage: { m1: retrieval('old') },
        pendingRetrieval: retrieval('in-flight'),
      }),
    });

    expect(result.current?.sources[0].fileId).toBe('in-flight');
  });

  /**
   * By transcript order, not by the map's key order. A regenerated answer
   * re-files an existing id, so insertion order stops matching the thread and
   * the rail would describe an answer further up the page.
   */
  it('takes the newest searching turn by message order', () => {
    const { result } = renderHook(
      () => useLatestRetrieval([message('m1'), message('m2'), message('m3')]),
      {
        wrapper: withStore({
          retrievalByMessage: { m3: retrieval('newest'), m1: retrieval('old') },
        }),
      },
    );

    expect(result.current?.sources[0].fileId).toBe('newest');
  });

  it('skips messages that did not search', () => {
    const { result } = renderHook(
      () => useLatestRetrieval([message('m1'), message('m2')]),
      { wrapper: withStore({ retrievalByMessage: { m1: retrieval('only') } }) },
    );

    expect(result.current?.sources[0].fileId).toBe('only');
  });
});

describe('useSourcesRailOpen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens by default', () => {
    const { result } = renderHook(() => useSourcesRailOpen());

    expect(result.current.isOpen).toBe(true);
  });

  it('remembers a closed rail across a reload', () => {
    const first = renderHook(() => useSourcesRailOpen());
    act(() => first.result.current.setOpen(false));

    const second = renderHook(() => useSourcesRailOpen());

    expect(second.result.current.isOpen).toBe(false);
  });

  it('remembers reopening it', () => {
    const first = renderHook(() => useSourcesRailOpen());
    act(() => first.result.current.setOpen(false));
    act(() => first.result.current.setOpen(true));

    const second = renderHook(() => useSourcesRailOpen());

    expect(second.result.current.isOpen).toBe(true);
  });

  /**
   * Private mode, or storage switched off. A preference nobody can save is not
   * a reason to hide the panel, and a throw here would take the whole thread
   * view down with it.
   */
  it('stays open when storage is unavailable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    const { result } = renderHook(() => useSourcesRailOpen());
    expect(result.current.isOpen).toBe(true);
    expect(() => act(() => result.current.setOpen(false))).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
