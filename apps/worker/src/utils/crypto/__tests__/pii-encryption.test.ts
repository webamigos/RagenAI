import { randomBytes } from 'node:crypto';
import { encryptContent, decryptContent } from '../pii-encryption';

describe('PII encryption (AES-256-GCM)', () => {
  const dek = randomBytes(32);

  it('encrypts and decrypts to original text', () => {
    const original = 'Jan Kowalski PESEL 80010112345';
    const encrypted = encryptContent(original, dek);
    expect(typeof encrypted).toBe('string');
    const decrypted = decryptContent(encrypted, dek);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const text = 'test text';
    const enc1 = encryptContent(text, dek);
    const enc2 = encryptContent(text, dek);
    expect(enc1).not.toBe(enc2);
  });

  it('decrypts to original for Unicode/Polish characters', () => {
    const original = 'Zażółć gęślą jaźń — ąćęłńóśźż';
    const encrypted = encryptContent(original, dek);
    expect(decryptContent(encrypted, dek)).toBe(original);
  });

  it('throws on corrupted payload', () => {
    expect(() => decryptContent('tooshort', dek)).toThrow();
  });

  it('throws when decrypted with a wrong key', () => {
    const wrongDek = randomBytes(32);
    const encrypted = encryptContent('sensitive data', dek);
    expect(() => decryptContent(encrypted, wrongDek)).toThrow();
  });
});
