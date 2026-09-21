# A "test this" box that runs a different path from the real one is worse than no box

**Area:** architecture, ux
**Module:** admin, web, packages/guardrails
**Topic:** guardrails, llm-policy, preview, pii-masking, judge, fidelity

## What happened

Phase C3 added a "test this policy" box to the guardrail rule form: paste a
message, see what the judge scores it. Two of the three obvious ways to build
it would have shipped a box that answers a *different question* from the one a
real turn asks — and neither failure has a symptom. The box returns a number
either way, in the right range, and the operator sets a threshold from it.

**The panel's own judge.** `apps/admin` calls no model provider, so the box
needed one from somewhere. Adding `ai` and `@ragenai/llm-gateway` to the panel
and writing a judge there is self-contained and looks correct. It is a third
binding: a third model id, a third timeout, a third reading of a provider
error — and it is the one binding *no customer traffic passes through*. Tuning
a threshold against it is tuning against a path that does not exist in
production.

**Unmasked text.** The input stage runs downstream of Presidio, so a judge in a
turn never sees a phone number — it sees `<PHONE_NUMBER_1>`. A box that judged
the pasted text raw would score a string no turn ever produces. The operator
most likely to use the box is the one writing a policy about personal data,
which is exactly the case where the two strings differ most.

A third, smaller version of the same thing: `runPolicyRules` returned only its
*hits*, so the first draft of the trial could say "it did not fire" and nothing
more. A miss at 0.05 and a miss at 0.68 against a threshold of 0.7 are the same
sentence and completely different decisions, and the number being tuned is the
one the box could not show.

## Why it is easy to get wrong

A preview feature has no oracle. Every other bug in this feature area announces
itself eventually — a rule that never fires gets noticed, a blocked turn gets
complained about. A *preview* that is subtly wrong produces a plausible number,
the operator acts on it, and the rule then behaves differently in production
from how it behaved in the box. The gap is attributed to the model being
non-deterministic, which is true and not the cause.

## What to do instead

- **Run the production path, from the process that runs it.** The panel posts
  to `/api/internal/guardrails/judge-policy` in `apps/web` rather than judging
  locally. `guardrails-are-not-recopied` asserts there are exactly two judge
  bindings; that assertion is now also the record of this decision, and a third
  binding fails it loudly.
- **Reproduce the transformations upstream of the thing being tested**, not
  just the thing itself. The trial masks first, in the same language the chat
  path does — `PII_MASKING_LANGUAGE` exists because two callers naming their
  own language is a trial that masks differently from the turn it predicts.
  When masking is on and the analyzer does not answer, the trial is **not run**
  rather than run against raw text.
- **Show the input the real path saw, not the input the user typed.** The box
  returns the masked text. A caveat under a field is read once; the actual
  string is something an operator can act on.
- **Give back the number, not the verdict.** Anything an operator tunes needs
  the value and the boundary, together.

## It happened again, in a feature that had never heard of guardrails

The MCP catalogue's **Test connection** button (ADR-52) is the same shape, and
it failed the same way within days of merging — which is the evidence that this
is a rule and not a guardrails anecdote.

The button opens an MCP session against the URL an operator just typed and
lists the tool names. `probeMcpServer` builds its transport with
`allowedProtocols: [parsed.protocol]`, and a comment says why: an internal
server on somebody's own network often has no certificate, and the *address*
policy decides what may be reached, not the scheme. The three runtime call
sites built the same transport and passed **no** `allowedProtocols`, so they
kept the guard's https-only default.

So a plain-`http` entry was accepted by the form, confirmed working by the
button — tool names and all — and refused by every tool load with
`InsecureProtocolError: only https is allowed`. The one check that exists to
tell a working endpoint from a typo *before a customer does* was reporting on a
request nobody would ever send.

Two things generalise past the specific bug:

- **The divergence was one option, not one path.** The probe and the runtime
  called the same function in the same package; the preview was faithful in
  every respect except the argument that decided the outcome. "Run the
  production path" is not enough on its own — it has to be run with the
  production *configuration*, and a shared helper with a permissive default is
  exactly where that slips.
- **A default that is right for a redirect is wrong for a first hop.**
  `allowedProtocols` defaulted to https so a `302` could not downgrade a
  connector mid-flight, which is correct — and the same value, applied to the
  connector's own address, refused an address the product had just told the
  operator was fine.

The fix threads the entry's own scheme (`protocolsFor`) to the call sites that
dial a catalogue entry, and the guard is a case in `connect-is-guarded` on both
apps — those two clients are copies and have drifted before.

## Where this applies next

Phase D adds output rules and will want the same box. Output is a *stream*
evaluated through a sliding window, so a trial that scores a whole string is
already a different path from the one it claims to preview — the window is the
part that decides whether a rule fires at all.

More generally: whenever a **Test / Preview / Try it** control exists, diff the
options it passes against the options the real call site passes, not just the
function both reach. A shared helper makes the two look identical at the call
site and behave differently at the default.
