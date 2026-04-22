import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DocumentsTableSkeleton } from '../DocumentsTableSkeleton';

describe('DocumentsTableSkeleton', () => {
  it('renderuje 10 wierszy tabeli', () => {
    const { container } = render(<DocumentsTableSkeleton />);
    const rows = container.querySelectorAll('tr');
    expect(rows).toHaveLength(10);
  });

  it('każdy wiersz ma 5 komórek td', () => {
    const { container } = render(<DocumentsTableSkeleton />);
    const rows = container.querySelectorAll('tr');
    rows.forEach((row) => {
      expect(row.querySelectorAll('td')).toHaveLength(5);
    });
  });

  it('renderuje wewnątrz elementu table', () => {
    const { container } = render(<DocumentsTableSkeleton />);
    expect(container.querySelector('table')).toBeInTheDocument();
  });
});
