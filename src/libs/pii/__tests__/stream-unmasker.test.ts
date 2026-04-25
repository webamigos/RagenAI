import { describe, it, expect } from 'vitest';
import { StreamUnmasker } from '../stream-unmasker';

describe('StreamUnmasker', () => {
  it('przepuszcza tekst bez zmian gdy aliasMap pusta', () => {
    const unmasker = new StreamUnmasker({});
    expect(unmasker.process('dowolny tekst')).toBe('dowolny tekst');
    expect(unmasker.flush()).toBe('');
  });

  it('podmienia kompletny token w jednym chunku', () => {
    const unmasker = new StreamUnmasker({ '<PL_NIP_1>': '1234567890' });
    const result = unmasker.process('numer nip <PL_NIP_1> w dokumencie');
    expect(result).toBe('numer nip 1234567890 w dokumencie');
  });

  it('buforuje niekompletny token i podmienia po kolejnym chunku', () => {
    const unmasker = new StreamUnmasker({ '<PL_NIP_1>': '1234567890' });

    const chunk1 = unmasker.process('numer nip <PL_NI');
    const chunk2 = unmasker.process('P_1> w dokumencie');

    expect(chunk1).toBe('numer nip ');
    expect(chunk2).toBe('1234567890 w dokumencie');
  });

  it('flush zwraca buforowany ogon jeśli nie był kompletnym tokenem', () => {
    const unmasker = new StreamUnmasker({ '<PL_NIP_1>': '1234567890' });

    const chunk = unmasker.process('tekst <PL_NI');
    const flushed = unmasker.flush();

    expect(chunk).toBe('tekst ');
    expect(flushed).toBe('<PL_NI');
  });

  it('podmienia wiele tokenów różnych typów', () => {
    const unmasker = new StreamUnmasker({
      '<PL_NIP_1>': '1234567890',
      '<EMAIL_ADDRESS_1>': 'jan@firma.pl',
    });

    const result = unmasker.process('nip <PL_NIP_1> email <EMAIL_ADDRESS_1>');
    expect(result).toBe('nip 1234567890 email jan@firma.pl');
  });

  it('nie podmienia tekstu który wygląda podobnie ale nie jest tokenem w mapie', () => {
    const unmasker = new StreamUnmasker({ '<PL_NIP_1>': '1234567890' });
    const result = unmasker.process('<PL_NIP_2> nie ma w mapie');
    expect(result).toBe('<PL_NIP_2> nie ma w mapie');
  });
});
