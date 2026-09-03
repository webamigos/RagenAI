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

async function analyzeText(
  text: string,
  entities: string[] | null,
): Promise<PresidioSpan[]> {
  const body: Record<string, unknown> = {
    text,
    language: 'pl',
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
 */
export async function maskPii({
  docs,
  piiPolicy,
  fileId,
  organizationId,
  userId,
  requestId,
}: {
  docs: Document[];
  piiPolicy: PiiPolicy;
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

  if (piiPolicy === 'NONE') {
    const result: Document[] = [];
    const allDetectedEntities = new Set<string>();

    for (let docIndex = 0; docIndex < docs.length; docIndex++) {
      const doc = docs[docIndex];

      try {
        const spans = await analyzeText(doc.pageContent, TOXIC_ONLY_ENTITIES);

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
    const spans = await analyzeText(doc.pageContent, entities);

    logger.debug({ docIndex, policy: piiPolicy }, 'maskPii: processed doc');

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
