# Security incident response runbook

## Severity levels

A **SEV1** incident is any confirmed exposure of customer data or a full
production outage. A **SEV2** incident degrades a customer-facing feature
without data loss. Everything else is **SEV3**.

## Response times

SEV1 must be acknowledged within 15 minutes, around the clock. SEV2 must be
acknowledged within 2 hours during business hours. SEV3 is handled on the next
working day.

## Roles

The on-call engineer is the incident commander until explicitly handed over.
The communications lead is the only person who talks to customers during a
SEV1.

## Post-mortem

A written post-mortem is due within 5 working days of a SEV1 or SEV2 being
resolved. Post-mortems are blameless and are published to the whole
engineering organisation.

## Escalation contact

Escalate an unacknowledged SEV1 to the VP of Engineering after 30 minutes.
