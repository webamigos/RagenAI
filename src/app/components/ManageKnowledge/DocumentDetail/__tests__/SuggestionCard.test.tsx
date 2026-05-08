import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';
import { SuggestionCard } from '../SuggestionCard';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

const baseSuggestion: OptimizationSuggestion = {
  id: 'sug-1',
  type: 'restructure',
  location: 'Sekcja 1',
  before: 'stary tekst',
  after: 'nowy tekst',
  rationale: 'Poprawi chunk boundaries',
  dimensions: {
    chunkStructure: {
      improved: true,
      confidence: 'high',
      reason: 'Lepsza struktura',
    },
    avgChunkSize: {
      improved: false,
      confidence: 'medium',
      reason: 'Bez zmian',
    },
  },
};

function renderCard(
  suggestion: OptimizationSuggestion,
  overrides: Partial<{
    isAccepted: boolean;
    isRejected: boolean;
    onAccept: (id: string) => void;
    onReject: (id: string) => void;
    onUndo: (id: string) => void;
    onShowDetails: (s: OptimizationSuggestion) => void;
  }> = {},
) {
  return render(
    <NextIntlClientProvider locale="pl" messages={{}}>
      <SuggestionCard
        suggestion={suggestion}
        isAccepted={overrides.isAccepted ?? false}
        isRejected={overrides.isRejected ?? false}
        onAccept={overrides.onAccept ?? vi.fn()}
        onReject={overrides.onReject ?? vi.fn()}
        onUndo={overrides.onUndo ?? vi.fn()}
        onShowDetails={overrides.onShowDetails ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('SuggestionCard', () => {
  describe('tagi wymiarów', () => {
    it('pokazuje tag wymiaru gdy dimension.improved = true', () => {
      renderCard(baseSuggestion);
      expect(screen.getByText('↑ Struktura')).toBeInTheDocument();
    });

    it('nie pokazuje tagu wymiaru gdy dimension.improved = false', () => {
      renderCard(baseSuggestion);
      expect(screen.queryByText('↑ Rozmiar chunków')).not.toBeInTheDocument();
    });

    it('pokazuje wiele tagów gdy kilka wymiarów ma improved = true', () => {
      const suggestion: OptimizationSuggestion = {
        ...baseSuggestion,
        dimensions: {
          chunkStructure: { improved: true, confidence: 'high', reason: 'r1' },
          entityDensity: { improved: true, confidence: 'medium', reason: 'r2' },
        },
      };
      renderCard(suggestion);
      expect(screen.getByText('↑ Struktura')).toBeInTheDocument();
      expect(screen.getByText('↑ Encje')).toBeInTheDocument();
    });

    it('nie pokazuje żadnych tagów gdy brak dimensions', () => {
      const suggestion: OptimizationSuggestion = {
        ...baseSuggestion,
        dimensions: {},
      };
      renderCard(suggestion);
      expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    });
  });

  describe('stan neutralny (nie zaakceptowana, nie odrzucona)', () => {
    it('pokazuje przyciski "Odrzuć" i "Zaakceptuj"', () => {
      renderCard(baseSuggestion);
      expect(
        screen.getByRole('button', { name: 'Odrzuć' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Zaakceptuj' }),
      ).toBeInTheDocument();
    });

    it('pokazuje przycisk "Szczegóły"', () => {
      renderCard(baseSuggestion);
      expect(
        screen.getByRole('button', { name: 'Szczegóły' }),
      ).toBeInTheDocument();
    });

    it('nie pokazuje przycisku "Cofnij"', () => {
      renderCard(baseSuggestion);
      expect(
        screen.queryByRole('button', { name: 'Cofnij' }),
      ).not.toBeInTheDocument();
    });

    it('wywołuje onAccept po kliknięciu "Zaakceptuj"', async () => {
      const onAccept = vi.fn();
      renderCard(baseSuggestion, { onAccept });
      await userEvent.click(screen.getByRole('button', { name: 'Zaakceptuj' }));
      expect(onAccept).toHaveBeenCalledWith('sug-1');
    });

    it('wywołuje onReject po kliknięciu "Odrzuć"', async () => {
      const onReject = vi.fn();
      renderCard(baseSuggestion, { onReject });
      await userEvent.click(screen.getByRole('button', { name: 'Odrzuć' }));
      expect(onReject).toHaveBeenCalledWith('sug-1');
    });

    it('wywołuje onShowDetails po kliknięciu "Szczegóły"', async () => {
      const onShowDetails = vi.fn();
      renderCard(baseSuggestion, { onShowDetails });
      await userEvent.click(screen.getByRole('button', { name: 'Szczegóły' }));
      expect(onShowDetails).toHaveBeenCalledWith(baseSuggestion);
    });
  });

  describe('stan zaakceptowana (isAccepted = true)', () => {
    it('pokazuje przyciski "Odrzuć" i "Cofnij"', () => {
      renderCard(baseSuggestion, { isAccepted: true });
      expect(
        screen.getByRole('button', { name: 'Odrzuć' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cofnij' }),
      ).toBeInTheDocument();
    });

    it('nie pokazuje przycisku "Zaakceptuj"', () => {
      renderCard(baseSuggestion, { isAccepted: true });
      expect(
        screen.queryByRole('button', { name: 'Zaakceptuj' }),
      ).not.toBeInTheDocument();
    });

    it('nie pokazuje przycisku "Szczegóły"', () => {
      renderCard(baseSuggestion, { isAccepted: true });
      expect(
        screen.queryByRole('button', { name: 'Szczegóły' }),
      ).not.toBeInTheDocument();
    });

    it('wywołuje onUndo po kliknięciu "Cofnij"', async () => {
      const onUndo = vi.fn();
      renderCard(baseSuggestion, { isAccepted: true, onUndo });
      await userEvent.click(screen.getByRole('button', { name: 'Cofnij' }));
      expect(onUndo).toHaveBeenCalledWith('sug-1');
    });

    it('wywołuje onReject po kliknięciu "Odrzuć" (zmiana decyzji)', async () => {
      const onReject = vi.fn();
      renderCard(baseSuggestion, { isAccepted: true, onReject });
      await userEvent.click(screen.getByRole('button', { name: 'Odrzuć' }));
      expect(onReject).toHaveBeenCalledWith('sug-1');
    });
  });

  describe('stan odrzucona (isRejected = true)', () => {
    it('pokazuje przyciski "Zaakceptuj" i "Cofnij"', () => {
      renderCard(baseSuggestion, { isRejected: true });
      expect(
        screen.getByRole('button', { name: 'Zaakceptuj' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cofnij' }),
      ).toBeInTheDocument();
    });

    it('nie pokazuje przycisku "Odrzuć"', () => {
      renderCard(baseSuggestion, { isRejected: true });
      expect(
        screen.queryByRole('button', { name: 'Odrzuć' }),
      ).not.toBeInTheDocument();
    });

    it('nie pokazuje przycisku "Szczegóły"', () => {
      renderCard(baseSuggestion, { isRejected: true });
      expect(
        screen.queryByRole('button', { name: 'Szczegóły' }),
      ).not.toBeInTheDocument();
    });

    it('wywołuje onUndo po kliknięciu "Cofnij"', async () => {
      const onUndo = vi.fn();
      renderCard(baseSuggestion, { isRejected: true, onUndo });
      await userEvent.click(screen.getByRole('button', { name: 'Cofnij' }));
      expect(onUndo).toHaveBeenCalledWith('sug-1');
    });

    it('wywołuje onAccept po kliknięciu "Zaakceptuj" (zmiana decyzji)', async () => {
      const onAccept = vi.fn();
      renderCard(baseSuggestion, { isRejected: true, onAccept });
      await userEvent.click(screen.getByRole('button', { name: 'Zaakceptuj' }));
      expect(onAccept).toHaveBeenCalledWith('sug-1');
    });
  });
});
