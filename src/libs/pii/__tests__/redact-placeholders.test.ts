import { describe, it, expect } from 'vitest';
import { redactPiiPlaceholders } from '../redact-placeholders';

describe('redactPiiPlaceholders', () => {
  it('rewrites the bare placeholder Presidio emits at ingest', () => {
    expect(redactPiiPlaceholders('Wnioski zatwierdza <PERSON>.')).toBe(
      'Wnioski zatwierdza [redacted person].',
    );
  });

  it('rewrites the numbered form used by chat-time masking', () => {
    expect(redactPiiPlaceholders('Napisz na <EMAIL_ADDRESS_1>')).toBe(
      'Napisz na [redacted email address]',
    );
  });

  it('rewrites every occurrence, not just the first', () => {
    expect(redactPiiPlaceholders('<PERSON_1> i <PERSON_2> podpisali')).toBe(
      '[redacted person] i [redacted person] podpisali',
    );
  });

  it('keeps the entity type distinguishable across types', () => {
    expect(
      redactPiiPlaceholders('<PL_PESEL> oraz <PL_IBAN> i <CREDIT_CARD>'),
    ).toBe(
      '[redacted national ID number] oraz [redacted bank account number] i [redacted payment card number]',
    );
  });

  it('falls back to a generic label so a new recognizer cannot leak a raw token', () => {
    expect(redactPiiPlaceholders('kod <SOME_NEW_ENTITY>')).toBe(
      'kod [redacted personal data]',
    );
  });

  it('leaves text without placeholders untouched', () => {
    const text = 'Limit zwrotu wynosi 2 847 zl brutto.';
    expect(redactPiiPlaceholders(text)).toBe(text);
  });

  it('does not swallow lowercase markup', () => {
    expect(redactPiiPlaceholders('tekst <b>pogrubiony</b>')).toBe(
      'tekst <b>pogrubiony</b>',
    );
  });

  it('does not touch the chunk wrapper the renderer adds around content', () => {
    expect(redactPiiPlaceholders('<chunk file="a.pdf">tresc</chunk>')).toBe(
      '<chunk file="a.pdf">tresc</chunk>',
    );
  });
});
