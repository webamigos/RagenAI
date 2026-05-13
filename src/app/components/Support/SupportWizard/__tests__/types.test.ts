import { describe, it, expect } from 'vitest';
import {
  bugSchema,
  questionSchema,
  suggestionSchema,
  SupportCategory,
} from '../types';

describe('bugSchema', () => {
  it('akceptuje poprawne dane', () => {
    const result = bugSchema.safeParse({
      title: 'Problem z logowaniem',
      description: 'Nie mogę się zalogować do aplikacji',
      steps: 'Krok 1: Otwórz stronę. Krok 2: Kliknij zaloguj.',
    });
    expect(result.success).toBe(true);
  });

  it('odrzuca tytuł krótszy niż 5 znaków', () => {
    const result = bugSchema.safeParse({
      title: 'Bug',
      description: 'Opis problemu technicznego z aplikacją',
      steps: 'Krok 1: Otwórz stronę i kliknij przycisk.',
    });
    expect(result.success).toBe(false);
  });

  it('odrzuca brakujące kroki reprodukcji', () => {
    const result = bugSchema.safeParse({
      title: 'Problem z logowaniem',
      description: 'Opis problemu technicznego',
      steps: '',
    });
    expect(result.success).toBe(false);
  });

  it('akceptuje opcjonalny screenshot jako undefined', () => {
    const result = bugSchema.safeParse({
      title: 'Problem z logowaniem',
      description: 'Nie mogę się zalogować do aplikacji',
      steps: 'Krok 1: Otwórz stronę. Krok 2: Kliknij zaloguj.',
      screenshot: undefined,
    });
    expect(result.success).toBe(true);
  });
});

describe('questionSchema', () => {
  it('akceptuje poprawne dane', () => {
    const result = questionSchema.safeParse({
      title: 'Jak skonfigurować asystenta?',
      message:
        'Chciałbym dowiedzieć się jak skonfigurować swojego asystenta AI.',
    });
    expect(result.success).toBe(true);
  });

  it('odrzuca wiadomość krótszą niż 10 znaków', () => {
    const result = questionSchema.safeParse({
      title: 'Pytanie o aplikację',
      message: 'Krótko',
    });
    expect(result.success).toBe(false);
  });
});

describe('suggestionSchema', () => {
  it('akceptuje poprawne dane', () => {
    const result = suggestionSchema.safeParse({
      title: 'Ciemny motyw w edytorze',
      description:
        'Byłoby świetnie gdyby edytor dokumentów obsługiwał ciemny motyw.',
    });
    expect(result.success).toBe(true);
  });

  it('odrzuca opis krótszy niż 10 znaków', () => {
    const result = suggestionSchema.safeParse({
      title: 'Ciemny motyw w edytorze',
      description: 'Fajne',
    });
    expect(result.success).toBe(false);
  });
});

describe('SupportCategory enum', () => {
  it('ma wartości bug, question, suggestion', () => {
    expect(SupportCategory.Bug).toBe('bug');
    expect(SupportCategory.Question).toBe('question');
    expect(SupportCategory.Suggestion).toBe('suggestion');
  });
});
