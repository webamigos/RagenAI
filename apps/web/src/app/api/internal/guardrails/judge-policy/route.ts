import {
  describePolicyFailure,
  MAX_POLICY_CHARS,
  runPolicyTrial,
  validatePolicy,
  type PolicyTrialResult,
} from '@ragenai/guardrails';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  InternalAuthError,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';
import { logger } from '@/app/lib/utils/logger';
import { createPolicyJudge } from '@/features/guardrails/utils/policy-judge';
import { MAX_USER_INPUT_LENGTH } from '@/libs/chains/utils/constants';
import { isPiiMaskingEnabled } from '@/libs/pii/anonymize-with-security-events';
import { PII_MASKING_LANGUAGE } from '@/libs/pii/masking-language';
import { presidioClient } from '@/libs/pii/presidio-client';
import { isAppAdmin } from '@/lib/auth-access-control';
import db from '@ragenai/prisma-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Score a draft policy against text a platform administrator pasted — the
 * "test this policy" box on the admin panel's rule form.
 *
 * **It runs here, in apps/web, rather than in the panel**, and that is the
 * point rather than a convenience. apps/web is a runtime that serves chat. A
 * trial using a judge of its own would be testing a binding no customer
 * traffic passes through: a different model id, a different timeout or a
 * different reading of a provider error, and the operator would tune a
 * threshold against a number that never blocks anybody. The panel has no
 * provider SDK and no credentials, and `guardrails-are-not-recopied` asserts
 * there are exactly two judge bindings — this endpoint is how it stays two.
 *
 * Two gates, as `/api/internal/invitations/resend` has: the shared secret
 * proves the caller is a Ragen service, and `adminUserId` is then re-read from
 * the database and must still hold the platform role and not be banned. The
 * secret alone would let anything holding it spend money on a judge model.
 *
 * **No AI-usage row is written.** `AiUsage.organizationId` is required and
 * foreign-keyed, and a platform administrator testing a draft has no tenant to
 * bill — inventing one would put a number on some organization's page that
 * nobody in it caused. The record of who ran a trial is the admin audit entry
 * the panel writes instead. That is a real limit rather than an oversight: the
 * provider bills for these calls and no page in Ragen shows them.
 */

const bodySchema = z.object({
  policy: z.string().min(1).max(MAX_POLICY_CHARS),
  /** `null` means the draft names none, so the judge's default applies. */
  threshold: z.number().min(0).max(1).nullable(),
  text: z.string().min(1).max(MAX_USER_INPUT_LENGTH),
  /** The acting platform administrator. Verified below, not trusted. */
  adminUserId: z.string().min(1),
});

export type PolicyTrialResponse = PolicyTrialResult & {
  /** What the judge was actually given, after masking. */
  readonly judgedText: string;
  /** Whether this installation masked it, so the panel can say which. */
  readonly masked: boolean;
};

export async function POST(request: NextRequest) {
  try {
    verifyInternalSecret(request);
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(
        request,
        '/api/internal/guardrails/judge-policy',
        'bad secret',
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const admin = await db.user.findUnique({
    where: { id: body.adminUserId },
    select: { id: true, role: true, banned: true },
  });

  // Read from the database rather than trusting the caller, and mirror the
  // panel's own guard: a revoked or banned administrator loses this
  // immediately rather than at the end of some cache window.
  if (!admin || admin.banned || !isAppAdmin(admin)) {
    recordInternalAuthFailure(
      request,
      '/api/internal/guardrails/judge-policy',
      'caller is not a platform administrator',
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // The same gate the panel applies before saving. Checked again because a
  // Server Action is not the only way to reach this, and because a judge asked
  // to score a message against an empty policy has no honest answer to give.
  const verdict = validatePolicy({
    policy: body.policy,
    threshold: body.threshold,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: describePolicyFailure(verdict.failure) },
      { status: 422 },
    );
  }

  // **Masked first, exactly as a turn is.** The judge in a turn never sees a
  // phone number: the input stage runs downstream of Presidio, so a policy
  // about personal data is scoring `<PHONE_NUMBER_1>`. A trial over raw text
  // would judge a different string from the one the rule will ever meet, and
  // the operator would tune against it — the one way this box could be worse
  // than no box at all. The masked text goes back in the response, so the
  // caveat is something they see rather than a sentence under the field.
  const masked = isPiiMaskingEnabled();
  let judgedText = body.text;

  if (masked) {
    try {
      const result = await presidioClient.anonymize(
        body.text,
        PII_MASKING_LANGUAGE,
      );
      judgedText = result.maskedText;
    } catch (error) {
      // Fail closed, as the chat path does. Judging the unmasked text would
      // answer a question about a string no turn produces.
      //
      // The error is *described*, never logged whole: the C2 lesson is that a
      // `{ err }` in a structured logger copies every enumerable property,
      // and a client error built from an HTTP failure carries the body it
      // sent — which here is the pasted text.
      logger.warn(
        {
          audit: true,
          adminUserId: admin.id,
          maskingError: error instanceof Error ? error.name : 'unknown',
        },
        'Policy trial could not mask its text; it was not judged unmasked',
      );
      return NextResponse.json(
        {
          error:
            'PII masking is on for this installation and the analyzer did ' +
            'not answer. The judge only ever sees masked text, so the trial ' +
            'was not run rather than run against something no turn produces.',
        },
        { status: 503 },
      );
    }
  }

  // `tracking: undefined` on purpose — see the note above about AiUsage.
  const result = await runPolicyTrial(
    { policy: body.policy, threshold: body.threshold },
    judgedText,
    createPolicyJudge({ tracking: undefined }),
  );

  return NextResponse.json({
    ...result,
    judgedText,
    masked,
  } satisfies PolicyTrialResponse);
}
