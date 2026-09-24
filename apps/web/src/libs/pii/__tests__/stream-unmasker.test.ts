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

  it('redaguje token w kształcie placeholdera, którego nie ma w mapie', () => {
    // Nothing to restore it to, so it must not reach the reader raw.
    const unmasker = new StreamUnmasker({ '<PL_NIP_1>': '1234567890' });
    const result = unmasker.process('<PL_NIP_2> nie ma w mapie');
    expect(result).toBe('[redacted tax ID] nie ma w mapie');
  });

  describe('a placeholder the model invented, with nothing masked', () => {
    // The demo defect: nothing in the question was masked, the model read a
    // real phone number in the context and wrote `<PL_PHONE_1>` instead.
    it('redacts it even when split across chunks', () => {
      const unmasker = new StreamUnmasker({});

      const out =
        unmasker.process('Call us at <PL_PH') +
        unmasker.process('ONE_') +
        unmasker.process('1> today.') +
        unmasker.flush();

      expect(out).toBe('Call us at [redacted phone number] today.');
      expect(out).not.toContain('<PL_PHONE_1>');
    });

    it('redacts it when the stream ends right after it', () => {
      const unmasker = new StreamUnmasker({});

      const out =
        unmasker.process('Phone: <PL_PHONE_1') + unmasker.process('>');

      expect(out + unmasker.flush()).toBe('Phone: [redacted phone number]');
    });

    it('still restores a mapped token beside an invented one', () => {
      const unmasker = new StreamUnmasker({ '<PL_NIP_1>': '1234567890' });

      const out =
        unmasker.process('NIP <PL_NI') +
        unmasker.process('P_1>, tel. <PL_PHONE_1>') +
        unmasker.flush();

      expect(out).toBe('NIP 1234567890, tel. [redacted phone number]');
    });
  });

  describe('prose that only looks like the start of a token', () => {
    it('does not hold back a `<` that cannot become a placeholder', () => {
      const unmasker = new StreamUnmasker({});

      // Emitted at once rather than stalling the stream until it ends.
      expect(unmasker.process('if a < b then')).toBe('if a < b then');
      expect(unmasker.process('<div>')).toBe('<div>');
      expect(unmasker.flush()).toBe('');
    });

    it('leaves markup and comparisons alone', () => {
      const unmasker = new StreamUnmasker({});

      expect(unmasker.process('x<y and y>z, <b>bold</b>, <1>')).toBe(
        'x<y and y>z, <b>bold</b>, <1>',
      );
    });

    it('releases a held tail that never closed, at flush', () => {
      const unmasker = new StreamUnmasker({});

      expect(unmasker.process('ends with <ABC')).toBe('ends with ');
      expect(unmasker.flush()).toBe('<ABC');
    });
  });
});
