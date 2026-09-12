/**
 * Integration tests against REAL Presidio containers (analyzer + anonymizer)
 * — real HTTP calls, no mocked fetch. Verifies the actual detection/masking
 * behavior of whatever image versions are configured, not just that our own
 * request-shaping code calls fetch correctly (that's `mask-pii.test.ts`,
 * which stays mocked and runs in the default `npm test` gate).
 *
 * Prerequisite: `docker compose up -d presidio-analyzer presidio-anonymizer`
 * (or the full stack) must be running first — see
 * `docs/runbooks/presidio-upgrade.md`. Run via:
 *
 *   npm run test:presidio-integration
 *
 * Deliberately NOT part of `npm test`/`npm run worker:test` — see
 * `jest.presidio-integration.config.ts` for why, and how it's kept separate.
 *
 * PII sample values below are synthetic, checksum-valid test data (computed
 * from the recognizers' own published algorithms in
 * `infra/presidio/analyzer/recognizers/pl_recognizers.py`), not real people's
 * identifiers.
 */
import type { Document } from '../../src/types/Document';
// Type-only import — erased at compile time, so it carries no runtime
// module evaluation and doesn't affect the require() timing below.
import type { maskPii as MaskPiiFn } from '../../src/activities/documents/mask-pii';

process.env.PRESIDIO_ANALYZER_URL = 'http://localhost:5002';
process.env.PRESIDIO_ANONYMIZER_URL = 'http://localhost:5003';
process.env.FEATURE_FLAG_PII_MASKING = '1';

// require(), not a real import — env vars above must be set before this
// module (and the consts.ts it pulls in) is first evaluated, and a real ES
// `import` hoists above plain statements regardless of source order. Kept
// as its own short statement (no destructuring/cast on this line) so
// Prettier never wraps it onto another line and detaches the disable
// comment below from the call it's meant to cover.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const maskPiiModule = require('../../src/activities/documents/mask-pii');
const maskPii: typeof MaskPiiFn = maskPiiModule.maskPii;

const ANALYZER_URL = process.env.PRESIDIO_ANALYZER_URL;
const ANONYMIZER_URL = process.env.PRESIDIO_ANONYMIZER_URL;

function makeDocs(contents: string[]): Document[] {
  return contents.map((pageContent, i) => ({
    pageContent,
    metadata: { source: `doc-${i}` },
  }));
}

beforeAll(async () => {
  const [analyzerHealth, anonymizerHealth] = await Promise.all([
    fetch(`${ANALYZER_URL}/health`),
    fetch(`${ANONYMIZER_URL}/health`),
  ]).catch((err) => {
    throw new Error(
      `Presidio containers not reachable at ${ANALYZER_URL} / ${ANONYMIZER_URL}. ` +
        `Run "docker compose up -d presidio-analyzer presidio-anonymizer" first. ` +
        `Original error: ${String(err)}`,
    );
  });
  if (!analyzerHealth.ok || !anonymizerHealth.ok) {
    throw new Error(
      `Presidio containers responded but not healthy (analyzer: ${analyzerHealth.status}, anonymizer: ${anonymizerHealth.status}).`,
    );
  }
});

describe('Presidio analyzer — real detection scenarios', () => {
  async function analyze(
    text: string,
    entities: string[] | null = null,
  ): Promise<
    { entity_type: string; start: number; end: number; score: number }[]
  > {
    const body: Record<string, unknown> = { text, language: 'pl' };
    if (entities !== null) {
      body.entities = entities;
    }
    const res = await fetch(`${ANALYZER_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  it('detects a valid PESEL', async () => {
    const results = await analyze('PESEL: 44051401359');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_PESEL', score: 1.0 }),
    );
  });

  it('detects a valid NIP, including dash-separated formatting', async () => {
    const compact = await analyze('NIP: 5252528111');
    expect(compact).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_NIP', score: 1.0 }),
    );
    const dashed = await analyze('NIP: 525-252-81-11');
    expect(dashed).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_NIP', score: 1.0 }),
    );
  });

  it('detects a valid REGON-9', async () => {
    const results = await analyze('REGON firmy: 012345899');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_REGON', score: 1.0 }),
    );
  });

  it('detects a valid Polish ID card number', async () => {
    const results = await analyze('Dowod osobisty: ABC412345');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_ID_CARD', score: 1.0 }),
    );
  });

  it('does NOT flag a checksum-invalid ID card look-alike', async () => {
    // Same shape (3 letters + 6 digits) as a real ID card, but the checksum
    // digit is wrong — must not false-positive just off the regex shape.
    const results = await analyze('Kod: ABC999999');
    expect(results).not.toContainEqual(
      expect.objectContaining({ entity_type: 'PL_ID_CARD' }),
    );
  });

  it('detects a Polish IBAN as both IBAN_CODE and PL_IBAN', async () => {
    const results = await analyze('Konto: PL61109010140000071219812874');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'IBAN_CODE', score: 1.0 }),
    );
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_IBAN', score: 1.0 }),
    );
  });

  it('detects a generic credit card number', async () => {
    const results = await analyze('Karta: 4111 1111 1111 1111');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'CREDIT_CARD', score: 1.0 }),
    );
  });

  it('detects a Polish phone number in international format', async () => {
    const results = await analyze('Tel: +48 500 600 700');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'PL_PHONE' }),
    );
  });

  it('detects an email address', async () => {
    const results = await analyze('Kontakt: jan.kowalski@example.com');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'EMAIL_ADDRESS', score: 1.0 }),
    );
  });

  it('detects a person name with Polish diacritics', async () => {
    const results = await analyze('Kontakt: Michał Woźniak');
    expect(results).toContainEqual(
      expect.objectContaining({ entity_type: 'PERSON', score: 1.0 }),
    );
  });

  it('returns nothing for text with no PII', async () => {
    const results = await analyze(
      'To jest zwykły tekst bez żadnych danych osobowych.',
    );
    expect(results).toEqual([]);
  });

  it('detects every entity in a realistic mixed paragraph', async () => {
    const text =
      'Klient Anna Nowak, PESEL 44051401359, NIP firmy 5252528111, ' +
      'email anna.nowak@example.com, mieszka w Warszawie.';
    const results = await analyze(text);
    const types = results.map((r) => r.entity_type);
    expect(types).toEqual(
      expect.arrayContaining(['PERSON', 'PL_PESEL', 'PL_NIP', 'EMAIL_ADDRESS']),
    );
  });

  it('respects an explicit entities filter (TOXIC_ONLY-style call)', async () => {
    // A paragraph with both a PERSON and a PL_IBAN, filtered to PERSON only.
    const text = 'Jan Kowalski, konto PL61109010140000071219812874.';
    const filtered = await analyze(text, ['PERSON']);
    expect(filtered.map((r) => r.entity_type)).toEqual(['PERSON']);

    const unfiltered = await analyze(text);
    expect(unfiltered.map((r) => r.entity_type)).toEqual(
      expect.arrayContaining(['PERSON', 'PL_IBAN']),
    );
  });
});

describe('maskPii activity — real analyzer + anonymizer round trip', () => {
  it('masks a PESEL end to end under STRICT policy', async () => {
    const docs = makeDocs(['Klient PESEL 44051401359 złożył reklamację.']);
    const result = await maskPii({
      docs,
      piiPolicy: 'STRICT',
      language: 'pol',
    });

    expect(result[0].pageContent).not.toContain('44051401359');
    expect(result[0].pageContent).toMatch(/<PL_PESEL/);
    expect(result[0].metadata.pii_masked_entities).toContain('PL_PESEL');
  });

  it('masks only the TOXIC_ONLY entity set, leaving other content untouched', async () => {
    const docs = makeDocs([
      'Michał Woźniak, PESEL 44051401359, mieszka w Warszawie od 2020 roku.',
    ]);
    const result = await maskPii({
      docs,
      piiPolicy: 'TOXIC_ONLY',
      language: 'pol',
    });

    // PERSON and PL_PESEL are in TOXIC_ONLY_ENTITIES; LOCATION/DATE_TIME are not.
    expect(result[0].pageContent).not.toContain('Michał Woźniak');
    expect(result[0].pageContent).not.toContain('44051401359');
    expect(result[0].pageContent).toContain('Warszawie');
  });

  it('leaves content untouched and reports no PII for a clean document', async () => {
    const docs = makeDocs(['Instrukcja obsługi urządzenia, rozdział trzeci.']);
    const result = await maskPii({
      docs,
      piiPolicy: 'STRICT',
      language: 'pol',
    });

    expect(result[0].pageContent).toBe(
      'Instrukcja obsługi urządzenia, rozdział trzeci.',
    );
    expect(result[0].metadata).toEqual({ source: 'doc-0' });
  });

  it('under NONE policy, flags high-risk PII without modifying content', async () => {
    const original = 'Numer PESEL klienta: 44051401359.';
    const docs = makeDocs([original]);
    const result = await maskPii({ docs, piiPolicy: 'NONE', language: 'pol' });

    expect(result[0].pageContent).toBe(original);
    expect(result[0].metadata).toMatchObject({
      pii_alert: true,
      pii_detected_entities: expect.arrayContaining(['PL_PESEL']),
    });
  });

  // The regression that prompted `language` to exist at all. Analysing every
  // document as Polish scored ordinary English words as PERSON at 0.85 — far
  // above the analyzer's 0.35 threshold — so an English policy document with
  // no personal data in it came out of ingest with `<PERSON>` where
  // `Flammable` and `from carriage` used to be. A mock cannot catch this: it
  // takes the real Polish NER model to produce the false positives.
  it('leaves an English document with no PII untouched', async () => {
    const original =
      'Flammable materials, gas cylinders over 4 litres, firearms without a ' +
      'permit, and sharp-edged objects that are not permanently secured are ' +
      'excluded from carriage.';
    const docs = makeDocs([original]);
    const result = await maskPii({
      docs,
      piiPolicy: 'TOXIC_ONLY',
      language: 'eng',
    });

    expect(result[0].pageContent).toBe(original);
    expect(result[0].metadata).not.toHaveProperty('pii_masked_entities');
  });

  it('masks real PII in an English document', async () => {
    const docs = makeDocs([
      'Contact the Passenger Services Office at claims@example.com.',
    ]);
    const result = await maskPii({
      docs,
      piiPolicy: 'TOXIC_ONLY',
      language: 'eng',
    });

    expect(result[0].pageContent).not.toContain('claims@example.com');
    expect(result[0].metadata).toMatchObject({
      pii_masked_entities: expect.arrayContaining(['EMAIL_ADDRESS']),
    });
  });

  // Documents the cost of the fallback rather than asserting it is fine: the
  // PL_* recognizers are registered only under `pl`, so an undetected language
  // means Polish national identifiers are not masked. Better a visible gap
  // than silently rewriting every non-Polish document — but it is a gap, and
  // this is where it is written down.
  it('does not mask a PESEL when the language could not be detected', async () => {
    const docs = makeDocs(['PESEL: 44051401359']);
    const result = await maskPii({ docs, piiPolicy: 'STRICT', language: null });

    expect(result[0].pageContent).toContain('44051401359');
  });

  it('processes multiple documents with different PII independently', async () => {
    const docs = makeDocs([
      'Email: jan@example.com',
      'PESEL: 44051401359',
      'Brak danych osobowych w tym akapicie.',
    ]);
    const result = await maskPii({
      docs,
      piiPolicy: 'STRICT',
      language: 'pol',
    });

    expect(result[0].pageContent).not.toContain('jan@example.com');
    expect(result[1].pageContent).not.toContain('44051401359');
    expect(result[2].pageContent).toBe('Brak danych osobowych w tym akapicie.');
  });
});
