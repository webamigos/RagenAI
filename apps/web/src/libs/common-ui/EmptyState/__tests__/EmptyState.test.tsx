import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FolderIcon } from '@heroicons/react/24/outline';
import { EmptyState } from '../EmptyState';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('EmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering podstawowych props', () => {
    it('renderuje tytuł', () => {
      render(<EmptyState title="Brak elementów" />);
      expect(screen.getByText('Brak elementów')).toBeInTheDocument();
    });

    it('renderuje opis gdy podany', () => {
      render(
        <EmptyState
          title="Brak elementów"
          description="Dodaj pierwszy element"
        />,
      );
      expect(screen.getByText('Dodaj pierwszy element')).toBeInTheDocument();
    });

    it('nie renderuje opisu gdy pominięty', () => {
      render(<EmptyState title="Brak elementów" />);
      expect(screen.queryByTestId('empty-state-description')).toBeNull();
    });

    it('renderuje ikonę gdy podana', () => {
      render(
        <EmptyState
          title="Brak elementów"
          icon={<FolderIcon data-testid="test-icon" className="size-10" />}
        />,
      );
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('nie renderuje kontenera ikony gdy ikona pominięta', () => {
      const { container } = render(<EmptyState title="Brak elementów" />);
      const iconWrapper = container.querySelector('[aria-hidden="true"]');
      expect(iconWrapper).not.toBeInTheDocument();
    });

    it('stosuje niestandardową klasę CSS', () => {
      const { container } = render(
        <EmptyState title="Brak elementów" className="py-20 custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('akcja z onClick', () => {
    it('renderuje przycisk z etykietą', () => {
      render(
        <EmptyState
          title="Brak elementów"
          actions={[{ label: 'Utwórz nowy', onClick: vi.fn() }]}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Utwórz nowy' }),
      ).toBeInTheDocument();
    });

    it('wywołuje onClick po kliknięciu przycisku', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <EmptyState
          title="Brak elementów"
          actions={[{ label: 'Utwórz nowy', onClick }]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Utwórz nowy' }));
      expect(onClick).toHaveBeenCalledOnce();
    });
  });

  describe('akcja z href', () => {
    it('renderuje link z etykietą', () => {
      render(
        <EmptyState
          title="Brak elementów"
          actions={[{ label: 'Przejdź dalej', href: '/home' }]}
        />,
      );
      expect(
        screen.getByRole('link', { name: 'Przejdź dalej' }),
      ).toBeInTheDocument();
    });

    it('renderuje link z poprawnym href', () => {
      render(
        <EmptyState
          title="Brak elementów"
          actions={[{ label: 'Przejdź dalej', href: '/home' }]}
        />,
      );
      expect(
        screen.getByRole('link', { name: 'Przejdź dalej' }),
      ).toHaveAttribute('href', '/home');
    });
  });

  describe('wiele akcji', () => {
    it('renderuje dwa przyciski gdy podano dwie akcje', () => {
      render(
        <EmptyState
          title="Brak elementów"
          actions={[
            { label: 'Akcja główna', onClick: vi.fn() },
            { label: 'Akcja drugorzędna', onClick: vi.fn() },
          ]}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Akcja główna' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Akcja drugorzędna' }),
      ).toBeInTheDocument();
    });

    it('każdy przycisk wywołuje własny handler', async () => {
      const user = userEvent.setup();
      const onClickPrimary = vi.fn();
      const onClickSecondary = vi.fn();
      render(
        <EmptyState
          title="Brak elementów"
          actions={[
            { label: 'Akcja główna', onClick: onClickPrimary },
            { label: 'Akcja drugorzędna', onClick: onClickSecondary },
          ]}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Akcja główna' }));
      expect(onClickPrimary).toHaveBeenCalledOnce();
      expect(onClickSecondary).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole('button', { name: 'Akcja drugorzędna' }),
      );
      expect(onClickSecondary).toHaveBeenCalledOnce();
    });
  });

  describe('brak akcji', () => {
    it('nie renderuje przycisków gdy actions to pusta tablica', () => {
      render(<EmptyState title="Brak elementów" actions={[]} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('nie renderuje przycisków gdy actions jest undefined', () => {
      render(<EmptyState title="Brak elementów" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });
});
