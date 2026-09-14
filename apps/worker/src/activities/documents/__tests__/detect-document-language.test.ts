import { detectDocumentLanguage } from '../detect-document-language.js';

// franc is ESM-only. That is why the suite used to reach it through a manual
// mock wired up in jest's `moduleNameMapper`: jest compiled this file to
// CommonJS, where `require('franc')` throws ERR_REQUIRE_ESM. Vitest runs the
// suite as ESM and intercepts the source's dynamic import directly, so the
// mock lives here now.
//
// It stays a mock: these cases are about how the activity handles franc's
// answers — the 'und' sentinel, a throw, empty input — not about whether
// franc classifies a given string correctly. That is franc's own suite's job,
// and asserting on it here would make this test fail on a franc upgrade.
const { mockFranc } = vi.hoisted(() => ({ mockFranc: vi.fn() }));

vi.mock('franc', () => ({ franc: mockFranc }));

vi.mock('../../../services/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

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
