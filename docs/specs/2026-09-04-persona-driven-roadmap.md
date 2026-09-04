# Persona-driven roadmap: what the personas document actually asks us to build

**Date:** 2026-09-04
**Source:** internal personas document (v. 2026-09-04), sales/marketing artifact
**Status:** plan — tickets created in ClickUp (Software Development → Ragen → Tasks)

## TLDR

The personas document is a positioning artifact, and it says so itself: "Wszystko
poniżej to hipotezy zbudowane na pozycjonowaniu Ragen i na doświadczeniu z
warsztatów, a nie wynik badania rynku." Most of it is guidance for conversations,
not a backlog.

What _is_ actionable is the recurring "co musi zobaczyć, żeby powiedzieć tak"
sections. Each one names an artifact or a capability a named buyer needs before
a deal moves. Nine of those are things this repository does not have today, and
that gap was verified against the code and docs rather than assumed. Those became
tickets. Everything else did not.

## What we checked, and what we found

| Persona asks for                                                          | State in repo today                                                                                                                                                                                                                                                                                                    | Ticket?                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Agnieszka: "jak długo trzymamy logi"                                      | `docs/security-and-privacy.md` states outright that **neither log has a retention policy or an automatic deletion path**. `AuditLog` and `SecurityEvent` accumulate until an operator deletes rows by hand.                                                                                                            | Yes                                         |
| Agnieszka: diagram przepływu danych                                       | No diagram anywhere in `docs/` or `apps/docs/docs/`. The prose in `security-and-privacy.md` is thorough but is prose.                                                                                                                                                                                                  | Yes                                         |
| Marek: "co jeśli Web Amigos zniknie"                                      | `security-and-privacy.md` asserts data ownership; there is no export mechanism in the app to make that operable.                                                                                                                                                                                                       | Yes (×2 — feature and commercial one-pager) |
| Tomek: "jak wygląda aktualizacja przy łamiących zmianach"                 | No CHANGELOG, no version policy, no upgrade guide. Breaking changes are recorded ad hoc inside ADRs 13/14/27.                                                                                                                                                                                                          | Yes                                         |
| Tomek: "ile to zje zasobów, czy potrzebuję GPU"                           | One line in `self-hosting.md` ("roughly 8 GB of RAM") and a table in the README. The GPU question is never answered.                                                                                                                                                                                                   | Yes                                         |
| Tomek: "czy podmienię model i bazę wektorową"                             | Model swap is real (LiteLLM). Vector-store swap **is not** — ADR-31 records that Meilisearch and Supabase clients exist but are not wired at the write end, so selecting one returns nothing. The README's "changing provider is a config file" is true of models and misleading if read as covering the vector store. | Yes                                         |
| Kuba: "docker compose, który wstaje od pierwszego razu, przykładowe dane" | Compose files exist; the only sample corpus is `apps/docs/screenshots/demo-data.sql`, which exists to make screenshots, not to give a first-time user something to ask questions about.                                                                                                                                | Yes                                         |
| Justyna: "wynik na dziesięciu prawdziwych pytaniach z jej zespołu"        | `apps/web/evals/e2e-rag/` already drives the real ingestion path end to end with hallucination and sycophancy guards. It is aimed at our fixture, not at a prospect's documents.                                                                                                                                       | Yes — productize it                         |
| Justyna: "te same pytania wracają codziennie"                             | KB analytics dashboard is `ready for release`; it does not surface repeated questions or answers with no source.                                                                                                                                                                                                       | Yes                                         |
| Everything downstream of the eight hypotheses                             | Untested.                                                                                                                                                                                                                                                                                                              | Yes — and it gates the rest                 |

## Already covered, deliberately not re-ticketed

- **Feedback collection** (Justyna, and signal category 4 in ADR-20) — ClickUp `86b9gb5d1`, `ready for dev`.
- **SIEM export** (Agnieszka) — ClickUp `86bbqqq22`.
- **Fully air-gapped variant with a local model** (Agnieszka, Michał) — ClickUp `86bbqqqcw`.
- **MFA / passkeys** (Agnieszka's security questionnaire) — ClickUp `86bbqqqec`.
- **Pricing, one annual number, ROI calculator** (Marek) — ClickUp `86b9mv32w`, `86b9mv4y6`.
- **Data-sovereignty content, CTO architecture post** (Tomek, Marek) — ClickUp `86b9ecjnq`, `86b9h85ex`.
- **Verifying sales claims against the code** (all personas) — ClickUp `86bbqqqr5`. The vector-store ticket below is one concrete instance of it.

## Deliberately not doing

- **A partner programme for Rafał (persona 5).** The document itself says a tiered,
  certified programme "brzmi jak korporacyjny teatr" at this stage, and sequences
  Rafał fourth — after two successful deployments. Building it now would be
  building for a persona we have not earned yet.
- **Anything aimed at Michał (persona 6, public sector).** The document's own
  conclusion: "Nie budować na tym pierwszych sześciu miesięcy po wydaniu."
- **A hosted SaaS tier**, and **core changes for a single startup's product** — both
  named anti-personas, and the second one conflicts with
  [`docs/open-core-boundary.md`](../open-core-boundary.md).
- **Claiming RODO/AI Act compliance in any artifact.** The document is explicit that
  "to jest zgodne z RODO" is the one thing not to say, because compliance depends on
  the operator's deployment. The compliance work below produces _evidence a
  reviewer can assess_, never a compliance claim.

## Order

The document's own sequencing ("Od kogo zaczynać") is sound and we follow it, with
one change: hypothesis validation moves to the front. Eight tickets rest on
assumptions the document says have never been tested, and two of the eight
questions ("czy open source jest dla Marka argumentem za, czy powodem do
niepokoju", "za co Rafał zapłaciłby przy otwartym kodzie") would, if answered the
other way, change what we build rather than just how we sell it.

1. **Validate the hypotheses** — 8 conversations. Gates the rest.
2. **Segment B (Justyna + Marek)** — pilot eval on the prospect's own questions,
   knowledge-gap analytics. Shortest path to revenue; compliance does not block.
3. **Open-source release (Tomek + Kuba)** — demo data, upgrade policy, sizing,
   honest swap documentation. Without this there are no inbound leads.
4. **Segment A (Marek + Agnieszka)** — log retention, data-flow diagram and
   security-questionnaire pack, org export and the exit-plan one-pager.

## Tickets

All in ClickUp, Software Development → Ragen → Tasks.

| #   | Ticket                                                      | Persona                        | ID                                                 |
| --- | ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| 1   | Zweryfikować 8 hipotez z dokumentu person — 8 rozmów        | wszystkie                      | [`86bbuzrq4`](https://app.clickup.com/t/86bbuzrq4) |
| 2   | Pilot eval: wynik na 10 prawdziwych pytaniach klienta       | 4 Justyna, 1 Marek             | [`86bbuzruz`](https://app.clickup.com/t/86bbuzruz) |
| 3   | Analityka luk w bazie wiedzy                                | 4 Justyna                      | [`86bbuzt05`](https://app.clickup.com/t/86bbuzt05) |
| 4   | `docker compose up` → demo z przykładowymi danymi           | 7 Kuba, 2 Tomek                | [`86bbuzt4h`](https://app.clickup.com/t/86bbuzt4h) |
| 5   | Polityka wersjonowania, CHANGELOG, ścieżka aktualizacji     | 2 Tomek, 6 Michał              | [`86bbuzt8z`](https://app.clickup.com/t/86bbuzt8z) |
| 6   | Sizing guide: sprzęt, przepustowość, GPU                    | 2 Tomek                        | [`86bbuztek`](https://app.clickup.com/t/86bbuztek) |
| 7   | Uczciwa dokumentacja wymiany modelu i bazy wektorowej       | 2 Tomek, 7 Kuba                | [`86bbuztma`](https://app.clickup.com/t/86bbuztma) |
| 8   | Retencja i automatyczne usuwanie logów                      | 3 Agnieszka                    | [`86bbuzttz`](https://app.clickup.com/t/86bbuzttz) |
| 9   | Diagram przepływu danych + pakiet na ankietę bezpieczeństwa | 3 Agnieszka                    | [`86bbuztzn`](https://app.clickup.com/t/86bbuztzn) |
| 10  | Eksport organizacji — techniczny plan wyjścia               | 1 Marek, 6 Michał, 3 Agnieszka | [`86bbuzu4q`](https://app.clickup.com/t/86bbuzu4q) |
| 11  | One-pager „Kto za to odpowiada"                             | 1 Marek                        | [`86bbuzu8w`](https://app.clickup.com/t/86bbuzu8w) |

Ticket 7 is also the first concrete instance of the standing process in
`86bbqqqr5` — verifying sales claims against the code. It exists because writing
this plan surfaced one: the README's model-swap promise reads as covering the
vector store, which ADR-31 records as untrue.
