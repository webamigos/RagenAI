import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThreadsListSkeleton } from '../ThreadsListSkeleton';

describe('ThreadsListSkeleton', () => {
  it('renderuje 8 wierszy placeholderów', () => {
    const { container } = render(<ThreadsListSkeleton />);
    const rows = container.querySelectorAll('.animate-pulse');
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it('wiersze mają klasę h-8', () => {
    const { container } = render(<ThreadsListSkeleton />);
    const h8Items = container.querySelectorAll('.h-8');
    expect(h8Items).toHaveLength(8);
  });
});
