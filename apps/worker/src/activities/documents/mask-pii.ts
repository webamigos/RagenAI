import type { Document } from '../../types/Document';
import {
  PII_MASKING_ENABLED,
  PRESIDIO_ANALYZER_URL,
  PRESIDIO_ANONYMIZER_URL,
} from '../../consts';
import { logger } from '../../services/logger';

type PiiPolicy = 'NONE' | 'TOXIC_ONLY' | 'STRICT';

type PresidioSpan = {
  entity_type: string;
  start: number;
  end: number;
  score: number;
};

type PresidioAnonymizeResponse = {
  text: string;
};

/**
 * The Polish-specific recognizers stay in this list for every language.
 * Presidio silently ignores an entity it has no recognizer for in the
 * requested language — `/analyze` with `language=en` and this list returns
 * HTTP 200 and simply no `PL_*` matches — so there is no need to branch the
 * list per language, and doing so would only risk the two copies drifting.
 */
const TOXIC_ONLY_ENTITIES = [
  'PERSON',
  'PHONE_NUMBER',
  'EMAIL_ADDRESS',
  'PL_PESEL',
  'PL_NIP',
  'PL_REGON',
  'PL_ID_CARD',
  'PL_IBAN',
];

/**
 * Languages the deployed analyzer can actually serve, from
 * `infra/presidio/analyzer/conf/analyzer.yaml`.
 *
 * This is not cosmetic: Presidio answers a language outside its configured set
 * with **HTTP 500** (`No matching recognizers were found to serve the
 * request.`), which Temporal would retry and then fail the ingest on. A
 * detected language is therefore only usable after being checked against this
 * list.
 *
 * `tests/architecture/presidio-languages-match-the-analyzer-config.test.ts`
 * fails if this and the YAML drift apart.
 */
export const PRESIDIO_SUPPORTED_LANGUAGES = ['en', 'pl'] as const;

/**
 * `detectDocumentLanguage` returns ISO 639-3 (franc's output); Presidio takes
 * ISO 639-1. Only the languages the analyzer supports need an entry — anything
 * else resolves to the fallback below regardless.
 */
const ISO_639_3_TO_PRESIDIO: Record<string, string> = {
  eng: 'en',
  pol: 'pl',
};

/**
 * Used when the language is undetected or is one the analyzer cannot serve.
 *
 * English rather than Polish, and the choice matters — analysing every
 * document as Polish is the bug this parameter exists to fix. The Polish NER
 * model labels ordinary English words as PERSON at 0.85 confidence, far above
 * the analyzer's 0.35 threshold, so an English document came back with
 * `Flammable` and `from carriage` replaced by `<PERSON>`; the damage lands in
 * the vector store, before embedding, and only a re-index undoes it.
 *
 * The fallback is not free, and the trade is worth stating. The analyzer
 * registers `PL_PESEL`, `PL_NIP`, `PL_REGON`, `PL_ID_CARD`, `PL_IBAN` and
 * `PL_PHONE` **only** under `pl`, so a Polish document whose language franc
 * could not determine has its national identifiers left unmasked. That is a
 * real gap — but it is a gap, not corruption: the alternative (defaulting to
 * `pl`) silently rewrites the text of every non-Polish document, in the vector
 * store, recoverable only by re-indexing. A missed identifier is visible and
 * fixable; a destroyed paragraph is neither. `EMAIL_ADDRESS`, `PHONE_NUMBER`
 * and the other generic recognizers are pattern-based and unaffected either
 * way; `PERSON` is the only NER-driven entity here.
 *
 * The fallback is reached only when detection genuinely failed — franc returns
 * `null` for text under its 10-character threshold or for undetermined input —
 * so it is the exception, and `maskPii` logs a warning naming the document
 * whenever it happens.
 */
export const PRESIDIO_FALLBACK_LANGUAGE = 'en';

export type ResolvedAnalyzerLanguage = {
  language: string;
  /** True when the detected language could not be used, so callers can log it. */
  fellBack: boolean;
};

/**
 * Map a detected ISO 639-3 code onto a language the analyzer can serve.
 *
 * Exported for the unit tests: this is the whole of the fix, and it is pure.
 */
export function resolveAnalyzerLanguage(
  detected: string | null | undefined,
): ResolvedAnalyzerLanguage {
  const mapped = detected ? ISO_639_3_TO_PRESIDIO[detected] : undefined;
  if (
    mapped &&
    (PRESIDIO_SUPPORTED_LANGUAGES as readonly string[]).includes(mapped)
  ) {
    return { language: mapped, fellBack: false };
  }
  return { language: PRESIDIO_FALLBACK_LANGUAGE, fellBack: true };
}

async function analyzeText(
  text: string,
  entities: string[] | null,
  language: string,
): Promise<PresidioSpan[]> {
  const body: Record<string, unknown> = {
    text,
    language,
  };

  if (entities !== null) {
    body.entities = entities;
  }

  const response = await fetch(`${PRESIDIO_ANALYZER_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Presidio /analyze failed (HTTP ${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as PresidioSpan[];
}

async function anonymizeText(
  text: string,
  analyzerResults: PresidioSpan[],
): Promise<string> {
  const response = await fetch(`${PRESIDIO_ANONYMIZER_URL}/anonymize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      analyzer_results: analyzerResults,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Presidio /anonymize failed (HTTP ${response.status} ${response.statusText})`,
    );
  }

  const result = (await response.json()) as PresidioAnonymizeResponse;
  return result.text;
}

/**
 * Temporal activity: mask PII in a batch of documents using the Presidio
 * sidecar.
 *
 * Policy behaviour:
 * - `NONE`       — run a detection-only pass using TOXIC_ONLY_ENTITIES; if
 *                  high-risk PII is found, log a warning and tag the document
 *                  with `pii_alert: true` in metadata. Content is never
 *                  modified. Detection errors are non-fatal (fail-open).
 * - `TOXIC_ONLY` — call Presidio with a focused entity list (PERSON, phone,
 *                  email, and Polish national identifiers).
 * - `STRICT`     — omit the explicit entity list so Presidio uses all of its
 *                  default recognizers (every built-in entity type).
 *
 * Documents are processed sequentially to avoid overwhelming the sidecar.
 * Any network or non-2xx HTTP error is thrown so Temporal's retry policy
 * can handle it (except for the NONE detection pass, which is advisory only).
 *
 * `language` is the document's detected ISO 639-3 code. It is not optional in
 * spirit: analysing every document with one hardcoded model is what corrupted
 * English documents at ingest. See `resolveAnalyzerLanguage`.
 */
export async function maskPii({
  docs,
  piiPolicy,
  language,
  fileId,
  organizationId,
  userId,
  requestId,
}: {
  docs: Document[];
  piiPolicy: PiiPolicy;
  /** ISO 639-3, from `detectDocumentLanguage`; `null` when undetected. */
  language?: string | null;
  fileId?: string;
  organizationId?: string;
  userId?: string | null;
  requestId?: string | null;
}): Promise<Document[]> {
  // Deployment-level opt-out. Checked before `piiPolicy` because even the
  // NONE policy below runs an advisory analyzer pass — without this, ingest
  // still requires a reachable Presidio on every deployment.
  if (!PII_MASKING_ENABLED) {
    logger.debug(
      { fileId, policy: piiPolicy },
      'maskPii: FEATURE_FLAG_PII_MASKING is off — skipping PII masking',
    );
    return docs;
  }

  const { language: analyzerLanguage, fellBack } =
    resolveAnalyzerLanguage(language);
  if (fellBack) {
    logger.warn(
      {
        fileId,
        detectedLanguage: language ?? null,
        analyzerLanguage,
        supported: PRESIDIO_SUPPORTED_LANGUAGES,
      },
      'maskPii: no analyzer model for the detected language — falling back. PERSON detection is best-effort for this document and the Polish national identifiers (PESEL/NIP/REGON/ID card/IBAN) are not registered under the fallback, so they will not be masked; pattern-based entities such as email and phone are unaffected',
    );
  }

  if (piiPolicy === 'NONE') {
    const result: Document[] = [];
    const allDetectedEntities = new Set<string>();

    for (let docIndex = 0; docIndex < docs.length; docIndex++) {
      const doc = docs[docIndex];

      try {
        const spans = await analyzeText(
          doc.pageContent,
          TOXIC_ONLY_ENTITIES,
          analyzerLanguage,
        );

        if (spans.length > 0) {
          const detectedEntities = [
            ...new Set(spans.map((s) => s.entity_type)),
          ];
          for (const e of detectedEntities) {
            allDetectedEntities.add(e);
          }
          logger.warn(
            { docIndex, detectedEntities, policy: 'NONE' },
            'maskPii: high-risk PII detected in NONE-policy document — content will NOT be masked',
          );
          result.push({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              pii_alert: true,
              pii_detected_entities: detectedEntities,
            },
          });
        } else {
          result.push(doc);
        }
      } catch (err) {
        logger.warn(
          { docIndex, err },
          'maskPii: PII detection pass failed for NONE-policy document — skipping alert',
        );
        result.push(doc);
      }
    }

    if (allDetectedEntities.size > 0 && fileId && organizationId) {
      const appUrl = process.env.RAGEN_APP_URL ?? 'http://localhost:3000';
      const secret = process.env.WORKER_SECRET_KEY;
      if (secret) {
        try {
          const notifyRes = await fetch(
            `${appUrl}/api/internal/security-events/notify`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-worker-secret': secret,
              },
              body: JSON.stringify({
                eventType: 'UPLOAD_SUSPICIOUS_CONTENT',
                severity: 'critical',
                source: 'upload',
                organizationId,
                userId: userId ?? null,
                requestId: requestId ?? null,
                metadata: {
                  fileId,
                  piiPolicy: 'NONE',
                  detectedEntityTypes: [...allDetectedEntities],
                  producer: 'worker-mask-pii',
                },
              }),
            },
          );
          if (!notifyRes.ok) {
            const body = await notifyRes.text().catch(() => '');
            logger.error(
              {
                fileId,
                status: notifyRes.status,
                statusText: notifyRes.statusText,
                body,
              },
              'maskPii: notify endpoint returned non-2xx response',
            );
          }
        } catch (err) {
          logger.error(
            { err, fileId },
            'maskPii: failed to notify apps/web of NONE-policy PII detection',
          );
        }
      } else {
        logger.warn(
          { fileId },
          'maskPii: WORKER_SECRET_KEY not set — skipping security event notification',
        );
      }
    }

    return result;
  }

  const entities: string[] | null =
    piiPolicy === 'STRICT' ? null : TOXIC_ONLY_ENTITIES;

  const result: Document[] = [];

  for (let docIndex = 0; docIndex < docs.length; docIndex++) {
    const doc = docs[docIndex];
    const spans = await analyzeText(
      doc.pageContent,
      entities,
      analyzerLanguage,
    );

    logger.debug(
      { docIndex, policy: piiPolicy, language: analyzerLanguage },
      'maskPii: processed doc',
    );

    if (spans.length === 0) {
      result.push(doc);
      continue;
    }

    const maskedText = await anonymizeText(doc.pageContent, spans);
    const maskedEntities = [...new Set(spans.map((s) => s.entity_type))];
    result.push({
      pageContent: maskedText,
      metadata: {
        ...doc.metadata,
        pii_masked_entities: maskedEntities,
      },
    });
  }

  return result;
}
