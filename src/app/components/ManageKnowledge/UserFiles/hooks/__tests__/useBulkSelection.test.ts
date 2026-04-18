import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBulkSelection } from '../useBulkSelection';

describe('useBulkSelection', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.isSelected('file-1')).toBe(false);
  });

  it('toggleFile adds and removes a single id', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.toggleFile('file-1'));
    expect(result.current.isSelected('file-1')).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    act(() => result.current.toggleFile('file-1'));
    expect(result.current.isSelected('file-1')).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it('toggleAll selects all when none selected', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c'];

    act(() => result.current.toggleAll(ids));
    expect(result.current.isAllSelected(ids)).toBe(true);
    expect(result.current.selectedCount).toBe(3);
  });

  it('toggleAll deselects all when all selected', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c'];

    act(() => result.current.toggleAll(ids));
    act(() => result.current.toggleAll(ids));
    expect(result.current.isAllSelected(ids)).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it('toggleAll selects remaining when partially selected', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c'];

    act(() => result.current.toggleFile('a'));
    act(() => result.current.toggleAll(ids));
    expect(result.current.isAllSelected(ids)).toBe(true);
    expect(result.current.selectedCount).toBe(3);
  });

  it('isIndeterminate returns true when some (but not all) are selected', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c'];

    act(() => result.current.toggleFile('a'));
    expect(result.current.isIndeterminate(ids)).toBe(true);
    expect(result.current.isAllSelected(ids)).toBe(false);
  });

  it('isIndeterminate returns false when none selected', () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.isIndeterminate(['a', 'b'])).toBe(false);
  });

  it('isIndeterminate returns false when all selected', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b'];

    act(() => result.current.toggleAll(ids));
    expect(result.current.isIndeterminate(ids)).toBe(false);
  });

  it('isAllSelected returns false for empty availableIds', () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.isAllSelected([])).toBe(false);
  });

  it('clearAll resets all selections', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c'];

    act(() => result.current.toggleAll(ids));
    expect(result.current.selectedCount).toBe(3);

    act(() => result.current.clearAll());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('toggleAll only affects provided ids (does not touch others)', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.toggleFile('other-file'));
    act(() => result.current.toggleAll(['a', 'b']));

    expect(result.current.isSelected('other-file')).toBe(true);
    expect(result.current.selectedCount).toBe(3);
  });

  it('toggleAll deselect only affects provided ids', () => {
    const { result } = renderHook(() => useBulkSelection());
    const viewIds = ['a', 'b'];

    act(() => result.current.toggleFile('other-file'));
    act(() => result.current.toggleAll(viewIds));
    // all selected now: other-file, a, b
    act(() => result.current.toggleAll(viewIds));
    // a and b deselected, other-file stays
    expect(result.current.isSelected('other-file')).toBe(true);
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.isSelected('b')).toBe(false);
  });
});
