import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeWatcher } from '../Providers';

const mockSetTheme = vi.fn();
let mockResolvedTheme = 'light';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
  }),
}));

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(event: { matches: boolean }) => void> = [];
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener: (
      _event: string,
      cb: (e: { matches: boolean }) => void,
    ) => {
      listeners.push(cb);
    },
    removeEventListener: vi.fn(),
  }));
  return {
    triggerChange: (newMatches: boolean) => {
      listeners.forEach((cb) => cb({ matches: newMatches }));
    },
  };
}

describe('ThemeWatcher', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockResolvedTheme = 'light';
  });

  it('does not call setTheme on mount, even if the resolved theme already matches the OS preference', () => {
    mockMatchMedia(false); // OS prefers light, matching mockResolvedTheme
    render(<ThemeWatcher />);

    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  it('does not call setTheme when the user explicitly picks a theme that happens to match the OS', () => {
    mockMatchMedia(false); // OS prefers light
    const { rerender } = render(<ThemeWatcher />);

    // Simulates the user picking "light" in Settings — resolvedTheme changes,
    // but this must not re-trigger the OS-preference check.
    mockResolvedTheme = 'light';
    rerender(<ThemeWatcher />);

    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  it('snaps back to "system" when a live OS color-scheme change matches the currently resolved theme', () => {
    const { triggerChange } = mockMatchMedia(false); // OS currently light
    mockResolvedTheme = 'light';
    render(<ThemeWatcher />);

    triggerChange(false); // OS emits a real change event, still resolving to light

    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('does not call setTheme on a live OS change that does not match the resolved theme', () => {
    const { triggerChange } = mockMatchMedia(false);
    mockResolvedTheme = 'dark';
    render(<ThemeWatcher />);

    triggerChange(false); // OS says light, resolved theme is dark — no match

    expect(mockSetTheme).not.toHaveBeenCalled();
  });
});
