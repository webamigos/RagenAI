import { maskPii } from '../mask-pii';
import type { Document } from '../../../types/Document';
import { logger } from '../../../services/logger';

jest.mock('../../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Masking is off by default in production, but the bulk of this file tests
// what happens when it's on — so the flag is exposed as a getter that
// individual tests can flip. See the "disabled" block at the end.
let piiMaskingEnabled = true;

jest.mock('../../../consts', () => ({
  ...jest.requireActual('../../../consts'),
  get PII_MASKING_ENABLED() {
    return piiMaskingEnabled;
  },
  PRESIDIO_ANALYZER_URL: 'http://presidio-test:5002',
  PRESIDIO_ANONYMIZER_URL: 'http://presidio-test:5003',
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const PRESIDIO_ANALYZER_BASE = 'http://presidio-test:5002';

function makeDocs(contents: string[]): Document[] {
  return contents.map((pageContent, i) => ({
    pageContent,
    metadata: { source: `doc-${i}` },
  }));
}

function setupFetch(analyzeResponse: object[], anonymizeText?: string): void {
  mockFetch.mockImplementation((url: string) => {
    if ((url as string).endsWith('/analyze')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(analyzeResponse),
        text: () => Promise.resolve(JSON.stringify(analyzeResponse)),
      });
    }
    if ((url as string).endsWith('/anonymize')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ text: anonymizeText ?? '[MASKED]' }),
        text: () =>
          Promise.resolve(
            JSON.stringify({ text: anonymizeText ?? '[MASKED]' }),
          ),
      });
    }
    return Promise.resolve({ ok: true, status: 202 });
  });
}

describe('maskPii activity', () => {
  let originalWorkerSecret: string | undefined;
  let originalRagenAppUrl: string | undefined;

  beforeEach(() => {
    piiMaskingEnabled = true;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 202 });
    originalWorkerSecret = process.env.WORKER_SECRET_KEY;
    originalRagenAppUrl = process.env.RAGEN_APP_URL;
    process.env.WORKER_SECRET_KEY = 'test-secret';
    process.env.RAGEN_APP_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalWorkerSecret === undefined) {
      delete process.env.WORKER_SECRET_KEY;
    } else {
      process.env.WORKER_SECRET_KEY = originalWorkerSecret;
    }
    if (originalRagenAppUrl === undefined) {
      delete process.env.RAGEN_APP_URL;
    } else {
      process.env.RAGEN_APP_URL = originalRagenAppUrl;
    }
  });

  it('returns docs unchanged for NONE policy when no PII spans detected', async () => {
    setupFetch([]);

    const docs = makeDocs([
      'John Doe lives at 123 Main St.',
      'Some other text.',
    ]);
    const result = await maskPii({ docs, piiPolicy: 'NONE' });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRESIDIO_ANALYZER_BASE}/analyze`,
      expect.objectContaining({ method: 'POST' }),
    );
    const anonymizeCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      url.endsWith('/anonymize'),
    );
    expect(anonymizeCalls).toHaveLength(0);

    expect(result[0].pageContent).toBe('John Doe lives at 123 Main St.');
    expect(result[1].pageContent).toBe('Some other text.');
    expect(result[0].metadata).not.toHaveProperty('pii_alert');
    expect(result[1].metadata).not.toHaveProperty('pii_alert');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('adds pii_alert metadata and logs warn for NONE policy when high-risk PII detected', async () => {
    const spans = [
      { entity_type: 'PERSON', start: 0, end: 8, score: 0.9 },
      { entity_type: 'PL_PESEL', start: 20, end: 31, score: 0.95 },
    ];
    setupFetch(spans);

    const docs = makeDocs(['John Doe, PESEL 12345678901']);
    const result = await maskPii({ docs, piiPolicy: 'NONE' });

    expect(result[0].pageContent).toBe('John Doe, PESEL 12345678901');
    expect(result[0].metadata).toMatchObject({
      source: 'doc-0',
      pii_alert: true,
      pii_detected_entities: expect.arrayContaining(['PERSON', 'PL_PESEL']),
    });

    const analyzeCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.endsWith('/analyze'),
    );
    expect(analyzeCall).toBeDefined();
    const analyzeBody = JSON.parse(analyzeCall![1].body as string);
    expect(analyzeBody.entities).toEqual(
      expect.arrayContaining([
        'PERSON',
        'PHONE_NUMBER',
        'EMAIL_ADDRESS',
        'PL_PESEL',
      ]),
    );

    const anonymizeCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      url.endsWith('/anonymize'),
    );
    expect(anonymizeCalls).toHaveLength(0);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        docIndex: 0,
        detectedEntities: expect.arrayContaining(['PERSON', 'PL_PESEL']),
        policy: 'NONE',
      }),
      expect.stringContaining('content will NOT be masked'),
    );
  });

  it('returns doc unchanged and logs warn when /analyze throws for NONE policy', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const docs = makeDocs(['Sensitive content here.']);
    const result = await maskPii({ docs, piiPolicy: 'NONE' });

    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe('Sensitive content here.');
    expect(result[0].metadata).not.toHaveProperty('pii_alert');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ docIndex: 0 }),
      expect.stringContaining('PII detection pass failed'),
    );
  });

  it('calls /analyze with TOXIC_ONLY entities and /anonymize when spans returned', async () => {
    const spans = [{ entity_type: 'PERSON', start: 0, end: 8, score: 0.9 }];
    setupFetch(spans, '[OSOBA]');

    const docs = makeDocs(['John Doe is here.']);
    const result = await maskPii({ docs, piiPolicy: 'TOXIC_ONLY' });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRESIDIO_ANALYZER_BASE}/analyze`,
      expect.objectContaining({ method: 'POST' }),
    );

    const analyzeCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.endsWith('/analyze'),
    );
    expect(analyzeCall).toBeDefined();
    const analyzeBody = JSON.parse(analyzeCall![1].body as string);
    expect(analyzeBody.entities).toEqual(
      expect.arrayContaining([
        'PERSON',
        'PHONE_NUMBER',
        'EMAIL_ADDRESS',
        'PL_PESEL',
        'PL_NIP',
        'PL_REGON',
        'PL_ID_CARD',
        'PL_IBAN',
      ]),
    );
    expect(analyzeBody.entities).not.toContain('LOCATION');
    expect(analyzeBody.entities).not.toContain('DATE_TIME');
    expect(analyzeBody.language).toBe('pl');

    const anonymizeCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.endsWith('/anonymize'),
    );
    expect(anonymizeCall).toBeDefined();
    const anonymizeBody = JSON.parse(anonymizeCall![1].body as string);
    expect(anonymizeBody.text).toBe('John Doe is here.');
    expect(anonymizeBody.analyzer_results).toEqual(spans);

    expect(result[0].pageContent).toBe('[OSOBA]');
    expect(result[0].metadata).toMatchObject({
      source: 'doc-0',
      pii_masked_entities: ['PERSON'],
    });
  });

  it('calls /analyze with comprehensive entities for STRICT policy', async () => {
    const spans = [
      { entity_type: 'LOCATION', start: 0, end: 6, score: 0.85 },
      { entity_type: 'DATE_TIME', start: 10, end: 20, score: 0.8 },
    ];
    setupFetch(spans, '[REDACTED]');

    const docs = makeDocs(['Warsaw on 2024-01-15 was cold.']);
    const result = await maskPii({ docs, piiPolicy: 'STRICT' });

    const analyzeCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.endsWith('/analyze'),
    );
    expect(analyzeCall).toBeDefined();
    const analyzeBody = JSON.parse(analyzeCall![1].body as string);
    expect(analyzeBody.entities).toBeUndefined();

    expect(result[0].pageContent).toBe('[REDACTED]');
    expect(result[0].metadata).toMatchObject({
      source: 'doc-0',
      pii_masked_entities: expect.arrayContaining(['LOCATION', 'DATE_TIME']),
    });
  });

  it('skips /anonymize and returns original pageContent when spans array is empty', async () => {
    setupFetch([]);

    const docs = makeDocs(['No PII here.']);
    const result = await maskPii({ docs, piiPolicy: 'TOXIC_ONLY' });

    const anonymizeCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      url.endsWith('/anonymize'),
    );
    expect(anonymizeCalls).toHaveLength(0);

    expect(result[0].pageContent).toBe('No PII here.');
    expect(result[0].metadata).toEqual({ source: 'doc-0' });
  });

  it('throws when /analyze returns a non-2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('Service Unavailable'),
    });

    const docs = makeDocs(['Some content.']);
    await expect(maskPii({ docs, piiPolicy: 'TOXIC_ONLY' })).rejects.toThrow(
      /Presidio \/analyze failed \(HTTP 503/,
    );
  });

  it('throws on network failure for /analyze', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const docs = makeDocs(['Some content.']);
    await expect(maskPii({ docs, piiPolicy: 'TOXIC_ONLY' })).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

  it('processes multiple documents sequentially and replaces all pageContents', async () => {
    const spans = [{ entity_type: 'PERSON', start: 0, end: 4, score: 0.95 }];
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).endsWith('/analyze')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(spans),
          text: () => Promise.resolve(''),
        });
      }
      if ((url as string).endsWith('/anonymize')) {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ text: `[MASKED-${callCount}]` }),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const docs = makeDocs([
      'Alice works here.',
      'Bob was there.',
      'Charlie too.',
    ]);
    const result = await maskPii({ docs, piiPolicy: 'TOXIC_ONLY' });

    expect(result).toHaveLength(3);
    expect(result[0].pageContent).toBe('[MASKED-1]');
    expect(result[1].pageContent).toBe('[MASKED-2]');
    expect(result[2].pageContent).toBe('[MASKED-3]');
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(result[0].metadata).toMatchObject({
      source: 'doc-0',
      pii_masked_entities: ['PERSON'],
    });
    expect(result[1].metadata).toMatchObject({
      source: 'doc-1',
      pii_masked_entities: ['PERSON'],
    });
    expect(result[2].metadata).toMatchObject({
      source: 'doc-2',
      pii_masked_entities: ['PERSON'],
    });
  });

  it('calls notify endpoint for NONE policy when PII detected', async () => {
    const spans = [{ entity_type: 'PL_PESEL', start: 0, end: 11, score: 0.95 }];
    setupFetch(spans);

    const docs = makeDocs(['93111111119 in document']);
    await maskPii({
      docs,
      piiPolicy: 'NONE',
      fileId: 'file-123',
      organizationId: 'org-456',
      userId: 'user-789',
      requestId: 'req-001',
    });

    const notifyCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      (url as string).includes('/api/internal/security-events/notify'),
    );
    expect(notifyCalls).toHaveLength(1);
    const [, options] = notifyCalls[0];
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      eventType: 'UPLOAD_SUSPICIOUS_CONTENT',
      severity: 'critical',
      source: 'upload',
      organizationId: 'org-456',
      userId: 'user-789',
      requestId: 'req-001',
      metadata: expect.objectContaining({
        fileId: 'file-123',
        piiPolicy: 'NONE',
        detectedEntityTypes: expect.arrayContaining(['PL_PESEL']),
        producer: 'worker-mask-pii',
      }),
    });
    expect(options.headers['x-worker-secret']).toBe('test-secret');
  });

  it('does not call notify endpoint for NONE policy when no PII detected', async () => {
    setupFetch([]);

    const docs = makeDocs(['clean document text']);
    await maskPii({
      docs,
      piiPolicy: 'NONE',
      fileId: 'file-123',
      organizationId: 'org-456',
    });

    const notifyCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      (url as string).includes('/api/internal/security-events/notify'),
    );
    expect(notifyCalls).toHaveLength(0);
  });

  it('does not call notify endpoint when fileId or organizationId missing', async () => {
    const spans = [{ entity_type: 'PL_PESEL', start: 0, end: 11, score: 0.95 }];
    setupFetch(spans);

    const docs = makeDocs(['93111111119 in document']);
    await maskPii({ docs, piiPolicy: 'NONE' });

    const notifyCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      (url as string).includes('/api/internal/security-events/notify'),
    );
    expect(notifyCalls).toHaveLength(0);
  });

  it('throws when /anonymize returns a non-2xx response', async () => {
    const spans = [{ entity_type: 'PERSON', start: 0, end: 4, score: 0.9 }];
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).endsWith('/analyze')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(spans),
          text: () => Promise.resolve(''),
        });
      }
      if ((url as string).endsWith('/anonymize')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Internal Server Error'),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const docs = makeDocs(['John Doe.']);
    await expect(maskPii({ docs, piiPolicy: 'TOXIC_ONLY' })).rejects.toThrow(
      /Presidio \/anonymize failed \(HTTP 500/,
    );
  });
});

describe('maskPii when FEATURE_FLAG_PII_MASKING is off (the default)', () => {
  beforeEach(() => {
    piiMaskingEnabled = false;
    mockFetch.mockReset();
  });

  it('returns the documents untouched', async () => {
    const docs = makeDocs(['Jan Kowalski, PESEL 44051401359']);

    const result = await maskPii({ docs, piiPolicy: 'STRICT' });

    expect(result).toEqual(docs);
  });

  it('never calls Presidio, so ingest works without those containers', async () => {
    await maskPii({ docs: makeDocs(['Jan Kowalski']), piiPolicy: 'STRICT' });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips the advisory analyzer pass the NONE policy would otherwise run', async () => {
    await maskPii({ docs: makeDocs(['PESEL 44051401359']), piiPolicy: 'NONE' });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
