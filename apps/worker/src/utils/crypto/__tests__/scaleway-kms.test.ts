import { randomBytes } from 'node:crypto';
import { ScalewayKMSService } from '../scaleway-kms';

const TEST_API_KEY = 'test-scw-api-key';
const TEST_KEY_ID = 'test-key-id-abc123';
const TEST_REGION = 'fr-par';
const EXPECTED_URL = `https://api.scaleway.com/key-manager/v1alpha1/regions/${TEST_REGION}/keys/${TEST_KEY_ID}/decrypt`;

describe('ScalewayKMSService.decryptDataKey', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: POSTs to correct URL with correct headers and returns decrypted buffer', async () => {
    const plaintextBytes = randomBytes(32);
    const plaintextBase64 = plaintextBytes.toString('base64');
    const ciphertext = 'some-base64-encoded-ciphertext';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plaintext: plaintextBase64 }),
      text: async () => '',
    } as unknown as Response);

    const service = new ScalewayKMSService({
      apiKey: TEST_API_KEY,
      region: TEST_REGION,
    });
    const result = await service.decryptDataKey(TEST_KEY_ID, ciphertext);

    expect(result.toString('hex')).toBe(plaintextBytes.toString('hex'));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(EXPECTED_URL);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe(
      TEST_API_KEY,
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ciphertext });
  });

  it('throws with status code when Scaleway returns a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response);

    const service = new ScalewayKMSService({ apiKey: TEST_API_KEY });
    await expect(
      service.decryptDataKey(TEST_KEY_ID, 'some-ciphertext'),
    ).rejects.toThrow(/401/);
  });

  it('throws when response is missing plaintext field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response);

    const service = new ScalewayKMSService({ apiKey: TEST_API_KEY });
    await expect(
      service.decryptDataKey(TEST_KEY_ID, 'some-ciphertext'),
    ).rejects.toThrow(/empty plaintext/);
  });

  it('throws when plaintext decodes to a buffer that is not 32 bytes', async () => {
    const wrongSizeBytes = randomBytes(16);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plaintext: wrongSizeBytes.toString('base64') }),
      text: async () => '',
    } as unknown as Response);

    const service = new ScalewayKMSService({ apiKey: TEST_API_KEY });
    await expect(
      service.decryptDataKey(TEST_KEY_ID, 'some-ciphertext'),
    ).rejects.toThrow(/Invalid DEK length from Scaleway KMS.*16/);
  });

  it('throws a timeout error when fetch does not resolve within requestTimeoutMs', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );

    const service = new ScalewayKMSService({
      apiKey: TEST_API_KEY,
      requestTimeoutMs: 50,
    });
    await expect(
      service.decryptDataKey(TEST_KEY_ID, 'some-ciphertext'),
    ).rejects.toThrow(/timed out after 50ms/);
  });
});
