import { getKeyProvider, isEncryptionConfigured } from './key-provider';
import { ScalewayKmsError } from './scaleway-kms';

/**
 * Whether the configured key provider can actually do the job, established by
 * doing it once at boot.
 *
 * `isEncryptionConfigured()` answers a narrower question than its callers
 * assume: whether the *variables are set*. Both halves of a Scaleway
 * configuration can be present and the key still be unusable — an IAM
 * application without `KeyManagerFullAccess`, a key id belonging to another
 * project, a `SCW_KEY_MANAGER_REGION` that does not hold the key. Nothing
 * catches that until the first write, and by then the failure surfaces one
 * message at a time as `UnknownChainError` — the generic "an unexpected error
 * occurred" toast, with the real 403 only in the container logs.
 *
 * That is the shape of the bug this package's own `localMasterKeyIsUsable()`
 * exists to prevent for the local provider ("presence alone was not enough").
 * The remote providers had no equivalent. This is it: generate a DEK, unwrap
 * it, throw both away.
 *
 * Two API calls rather than one, because `encrypt` and `decrypt` are separate
 * permissions on a Scaleway key and on an AWS key policy. A principal allowed
 * to wrap but not unwrap writes messages nobody can ever read back — worse
 * than failing, and invisible to a probe that only generates.
 */
export type EncryptionProbeStatus =
  'ok' | 'skipped' | 'misconfigured' | 'unavailable';

export type EncryptionProbeResult = {
  status: EncryptionProbeStatus;
  /** Which provider was probed, for the log line. `null` when skipped. */
  provider: ConfiguredProvider | null;
  /** Operator-facing detail. Never contains key material. */
  detail?: string;
};

export type ConfiguredProvider = 'scaleway' | 'kms' | 'local';

let lastResult: EncryptionProbeResult | null = null;

/**
 * Run the probe and cache its verdict for `getEncryptionStartupStatus()`.
 *
 * Call once, from a boot path. It never throws: a boot check that can itself
 * crash the boot is a worse failure than the one it is looking for.
 */
export async function probeEncryptionProvider(): Promise<EncryptionProbeResult> {
  if (!isEncryptionConfigured()) {
    // Not this function's call to make. "No provider configured" is already
    // `getEncryptionStartupStatus()`'s business, and it knows about
    // `isEncryptionRequired()` and `ALLOW_UNENCRYPTED` — which this does not.
    lastResult = { status: 'skipped', provider: null };
    return lastResult;
  }

  const provider = configuredProvider();

  try {
    const keyProvider = getKeyProvider();
    const { encryptedDek, plaintextDek } = await keyProvider.generateDataKey();
    const unwrapped = await keyProvider.decryptDataKey(encryptedDek);

    if (!unwrapped.equals(plaintextDek)) {
      // Not a permissions problem and not a blip: the key that wrapped the
      // DEK is not the key that unwrapped it. Treated as fatal because every
      // message written under this configuration would be unreadable.
      lastResult = {
        status: 'misconfigured',
        provider,
        detail:
          'the provider unwrapped a data key to different bytes than it wrapped',
      };
      return lastResult;
    }

    lastResult = { status: 'ok', provider };
    return lastResult;
  } catch (error) {
    lastResult = {
      status: isPermanentFailure(error) ? 'misconfigured' : 'unavailable',
      provider,
      detail: messageOf(error),
    };
    return lastResult;
  }
}

/** The cached verdict, or `null` if the probe has not run in this process. */
export function getEncryptionProbeResult(): EncryptionProbeResult | null {
  return lastResult;
}

/**
 * Whether the probe established that the configured provider cannot work.
 *
 * Deliberately false while the probe has not run (`null`) and for
 * `'unavailable'`, so a process that never probes behaves exactly as it did
 * before this existed, and a network blip at boot does not strand a working
 * deployment behind a blocking screen until someone restarts it.
 */
export function encryptionProviderIsUnusable(): boolean {
  return lastResult?.status === 'misconfigured';
}

export function resetEncryptionProbeForTests(): void {
  lastResult = null;
}

/**
 * Which provider the environment selects.
 *
 * A label for the log line, not a second selection rule — but it repeats the
 * branch order in `getKeyProvider()`, so `probe.test.ts` asserts the two agree
 * for every configuration. That pairing is the same invariant the key-provider
 * module documents between its factory and its predicate.
 */
function configuredProvider(): ConfiguredProvider {
  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (explicit === 'scaleway' || explicit === 'kms' || explicit === 'local') {
    return explicit;
  }
  if (process.env.SCW_KEY_MANAGER_KEY_ID && process.env.SCW_API_KEY) {
    return 'scaleway';
  }
  if (process.env.AWS_KMS_KEY_ID) {
    return 'kms';
  }
  return 'local';
}

/**
 * Whether a restart could plausibly fix this.
 *
 * Permanent: anything the service answered with a 4xx, and any failure our own
 * code raised about the configuration itself. Transient: timeouts, 5xx,
 * throttling, and a socket that never opened.
 *
 * The default is *transient*. An unrecognised error blocking every request is
 * a worse outcome than one that keeps a deployment running and noisy, and the
 * error is logged either way.
 */
function isPermanentFailure(error: unknown): boolean {
  if (error instanceof ScalewayKmsError) {
    return isPermanentStatus(error.status);
  }

  const status = awsHttpStatus(error);
  if (status !== null) {
    return isPermanentStatus(status);
  }

  const name = error instanceof Error ? error.name : '';
  if (AWS_PERMANENT_ERROR_NAMES.has(name)) {
    return true;
  }

  // Raised by this package before any call goes out: a missing key id, an
  // unknown ENCRYPTION_PROVIDER, a DEK that is not 32 bytes, a response
  // missing half its fields. None of those improve on retry.
  return CONFIGURATION_ERROR_PATTERN.test(messageOf(error));
}

function isPermanentStatus(status: number): boolean {
  // 408 and 429 are 4xx that say "later", not "never".
  if (status === 408 || status === 429) {
    return false;
  }
  return status >= 400 && status < 500;
}

function awsHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const metadata = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata;
  return typeof metadata?.httpStatusCode === 'number'
    ? metadata.httpStatusCode
    : null;
}

/**
 * AWS SDK errors do not always carry `$metadata` — a credential resolution
 * failure happens before any request — so the names carry those cases.
 */
const AWS_PERMANENT_ERROR_NAMES = new Set([
  'AccessDeniedException',
  'CredentialsProviderError',
  'DisabledException',
  'IncorrectKeyException',
  'InvalidCiphertextException',
  'InvalidKeyUsageException',
  'KMSInvalidStateException',
  'NotFoundException',
  'UnrecognizedClientException',
]);

const CONFIGURATION_ERROR_PATTERN =
  /is not configured|Unknown ENCRYPTION_PROVIDER|No encryption provider configured|Invalid DEK length|returned incomplete response|returned empty/i;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
