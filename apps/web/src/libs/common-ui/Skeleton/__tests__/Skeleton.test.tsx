import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Skeleton,
  SkeletonList,
  PageSkeleton,
  LoadingSkeleton,
} from '../Skeleton';

describe('Skeleton', () => {
  it('renderuje div z klasą animate-pulse', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('stosuje przekazaną klasę height', () => {
    const { container } = render(<Skeleton height="h-10" />);
    expect(container.firstChild).toHaveClass('h-10');
  });

  it('stosuje przekazaną klasę width', () => {
    const { container } = render(<Skeleton width="w-32" />);
    expect(container.firstChild).toHaveClass('w-32');
  });

  it('stosuje przekazaną className', () => {
    const { container } = render(<Skeleton className="my-custom" />);
    expect(container.firstChild).toHaveClass('my-custom');
  });

  it('renderuje children wewnątrz diva', () => {
    render(
      <Skeleton>
        <span data-testid="child">X</span>
      </Skeleton>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('wariant card renderuje wrapper z border', () => {
    const { container } = render(<Skeleton card />);
    expect(container.firstChild).toHaveClass('border');
  });

  it('zawiera klasę dark mode bg', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.animate-pulse');
    expect(el?.className).toMatch(/dark:/);
  });
});

describe('SkeletonList', () => {
  it('renderuje dokładnie count elementów z animate-pulse', () => {
    const { container } = render(<SkeletonList count={5} />);
    const items = container.querySelectorAll('.animate-pulse');
    expect(items).toHaveLength(5);
  });

  it('domyślnie renderuje 3 elementy', () => {
    const { container } = render(<SkeletonList />);
    const items = container.querySelectorAll('.animate-pulse');
    expect(items).toHaveLength(3);
  });
});

describe('PageSkeleton', () => {
  it('renderuje bez błędów', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe('LoadingSkeleton', () => {
  it('renderuje bez błędów', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
