# Security Policy

Ragen is deployed on infrastructure our users control, often holding their
internal documents. We take reports seriously and respond on a stated schedule.

## Reporting a vulnerability

**Do not open a public issue.** Report privately to **security@webamigos.pl**, or
through GitHub's [private vulnerability
reporting](https://github.com/webamigos/ragen-app/security/advisories/new).

Include what you have — a partial report is better than none:

- what the vulnerability is, and which component or route it affects
- steps to reproduce, or a proof of concept
- the impact you think it has, and who it affects
- a suggested fix, if you have one

## What to expect

| Step | Timeline |
|---|---|
| Acknowledgement that we received your report | 48 hours |
| Initial assessment and severity classification | 7 days |
| A fix timeline communicated back to you | 14 days |
| Patch released | Critical: as fast as we can. High: 30 days. Medium/low: next release. |

We will keep you updated as it moves, and credit you in the release notes unless
you would rather stay anonymous.

## Scope

**In scope** — anything that lets someone reach data or actions they should not:

- cross-tenant data access (one organization reading another's threads,
  documents, projects or vectors)
- authentication or authorization bypass, including API-key and session handling
- prompt injection that extracts the system prompt, other users' documents, or
  causes the assistant to act outside its instructions
- leakage of secrets, PII or document content through logs, traces, error
  messages or API responses
- SQL injection, SSRF, RCE, and the rest of the usual list
- vulnerabilities in how we handle uploaded documents (parsing, storage,
  retrieval)

**Out of scope:**

- findings that require an attacker to already hold valid credentials for the
  organization they are attacking
- denial of service through sheer volume, and rate-limit tuning
- vulnerabilities in third-party services we integrate with — report those to
  the service; tell us if our integration makes it worse
- results from an automated scanner with no demonstrated exploit
- missing hardening headers with no demonstrated impact

## Deployment note

Ragen is self-hosted: **you** run it, so you own patching. Watch releases for
security fixes. A vulnerability in a dependency of your own deployment (your
Postgres, your reverse proxy) is yours to patch, not ours — but tell us if our
defaults made it worse, because that is a bug in our defaults.

Security-relevant defaults are documented in
[`docs/security-monitoring.md`](docs/security-monitoring.md) and the ADRs under
[`docs/adrs/`](docs/adrs/) — in particular ADR-02 and ADR-06 (encryption),
ADR-13 (API keys), ADR-23 (tenant scoping) and ADR-24 (PII masking).
