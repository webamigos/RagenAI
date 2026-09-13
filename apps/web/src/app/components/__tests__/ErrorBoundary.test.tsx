import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

vi.mock('../../lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

describe('ErrorBoundary', () => {
  it('uses the translated unknown-error fallback for errors without a message', () => {
    const ThrowingChild = () => { throw new Error(); };
    render(<ErrorBoundary t={{ error: 'Error', 'try-again': 'Try again', 'unknown-error': 'Unknown application error' }}><ThrowingChild /></ErrorBoundary>);
    expect(screen.getByText('Unknown application error')).toBeInTheDocument();
    expect(screen.queryByText('Nieznany błąd aplikacji')).not.toBeInTheDocument();
  });
});
