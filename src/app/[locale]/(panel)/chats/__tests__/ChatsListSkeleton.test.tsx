import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChatsListSkeleton } from '../ChatsListSkeleton';

describe('ChatsListSkeleton', () => {
  it('renderuje 8 wierszy placeholderów', () => {
    const { container } = render(<ChatsListSkeleton />);
    const rows = container.querySelectorAll('.divide-y > div');
    expect(rows).toHaveLength(8);
  });

  it('wiersze zawierają elementy animate-pulse', () => {
    const { container } = render(<ChatsListSkeleton />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });
});
