import { detectDocumentLanguage } from '../detect-document-language';
// Importing the manual mock directly (not the real 'franc' package) — the
// real package is ESM-only, and this test file compiles as CommonJS, so a
// static `import ... from 'franc'` fails `tsc` even though Jest's
// moduleNameMapper would redirect it correctly at runtime. The mock is what
// Jest substitutes for every `franc` import project-wide (see
// jest.config.ts), so importing it directly here reaches the exact same
// jest.fn() instance that detect-document-language.ts's dynamic import
// resolves to.
import { franc } from '../../../__mocks__/franc';

jest.mock('../../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFranc = franc as jest.Mock;

describe('detectDocumentLanguage', () => {
  beforeEach(() => {
    mockFranc.mockReset();
  });

  it("returns franc's detected code on the happy path", async () => {
    mockFranc.mockReturnValue('eng');

    const result = await detectDocumentLanguage({
      documentText: 'Real document content long enough to be meaningful.',
    });

    expect(result).toBe('eng');
    expect(mockFranc).toHaveBeenCalledWith(
      'Real document content long enough to be meaningful.',
    );
  });

  it('trims the input before passing it to franc', async () => {
    mockFranc.mockReturnValue('eng');

    await detectDocumentLanguage({
      documentText: '  \n  content with surrounding whitespace  \n  ',
    });

    expect(mockFranc).toHaveBeenCalledWith(
      'content with surrounding whitespace',
    );
  });

  it('normalizes franc\'s "und" sentinel to null', async () => {
    mockFranc.mockReturnValue('und');

    const result = await detectDocumentLanguage({
      documentText: 'Some ambiguous or too-mixed content.',
    });

    expect(result).toBeNull();
  });

  it('returns null for empty input without calling franc', async () => {
    const result = await detectDocumentLanguage({ documentText: '   ' });

    expect(result).toBeNull();
    expect(mockFranc).not.toHaveBeenCalled();
  });

  it('returns null instead of throwing when franc itself errors', async () => {
    mockFranc.mockImplementation(() => {
      throw new Error('unexpected franc failure');
    });

    const result = await detectDocumentLanguage({
      documentText: 'This text is long enough to reach franc.',
    });

    expect(result).toBeNull();
  });
});
