# Regresja integracyjna — 2026-09-21

Przebieg lokalny na `main` @ `97fdc9404`, po zamknięciu faz A–E guardrails.
Uruchomiony ręcznie zamiast zaplanowanego na czwartek 24.09.

**Wynik w jednym zdaniu:** bramka jest zielona, faza D działa end-to-end i jest
poprawnie utrwalana, a wszystkie znalezione problemy dotyczą **lokalnej
harmonii z CI i tego, czego testy nie sprawdzają** — nie samej funkcjonalności
guardraili.

## 1. Środowisko

| Co | Wynik |
|---|---|
| Node | v24.15.0 — dokładnie na dolnej granicy `^24.15.0 \|\| >=26.0.0` |
| npm | 10.9.8 |
| Branch | `main`, czysty poza jednym plikiem nieśledzonym (D-02) |
| Kontenery | postgres/redis/qdrant/docling/presidio ×2 — wszystkie `healthy` |
| Porty | 55432 (pg), 56379 (redis), 6333 (qdrant) — kontenerowe, nie natywne |
| **Dysk** | **14 GiB wolnego z 460 GiB (97 % zajęte)** — D-01 |

## 2. `npm run verify` — ZIELONE

```
Tasks:    65 successful, 65 total
Cached:   63 cached, 65 total
Test Files 187 passed (187)
Tests      2761 passed (2761)
```

Zastrzeżenie: 63 z 65 zadań z cache'a turbo. Hash jest liczony z treści, więc
wynik jest ważny, ale ten przebieg **nie zbudował niczego od zera**.

## 3. `npm run web:e2e`

Dwa przebiegi. Pierwszy był czerwony z powodu mojego środowiska (D-07), drugi
jest miarodajny:

```
5 failed
  p0-22-projects › set and clear project system prompt / instructions
  p0-30-output-guardrail-refusal › ×4  (plik nieśledzony, D-02)
16 skipped
194 passed (6.4m)
```

Po odjęciu nieśledzonego pliku: **194 zielone, jedna realna porażka** —
`p0-22-projects`, opisana w D-09. Nie jest flaky: padła w obu podejściach
(pierwsze i retry), z identycznym błędem.

## 4. Przeklikanie aplikacji

Zrzuty: 24 ekrany panelu (`web-*`), 19 ekranów panelu platformowego (`admin-*`)
i pięć zrzutów scenariuszy guardrailowych (`web-9*`). Wszystkie 43 strony
odpowiedziały 200 i żadna nie pokazała ekranu błędu.

**Zrzuty nie są w repozytorium** — 48 plików PNG waży 9,3 MB, a git trzymałby je
na zawsze. Leżą lokalnie w
`docs/screenshots/2026-09-21-guardrails-regression/`. Nazwy plików są cytowane
niżej przy poszczególnych scenariuszach.

Środowisko przeklikania: apps/web i apps/admin z builda produkcyjnego przeciw
bazie `ragen_e2e`, z mockiem LLM na 4100 i `routes.e2e.yaml` — czyli tym samym
stanem, na którym stoi suita, ale z ręcznym sterowaniem. Nie tykałem bazy
`ragen`, bo nie mam do niej konta.

### Co zostało zweryfikowane ręcznie

| Scenariusz | Wynik |
|---|---|
| Logowanie, sesja, przełączenie zakresu wiedzy | OK |
| Czat: pierwsza tura, odpowiedź z modelu, auto-tytuł wątku | OK |
| Czat: druga i trzecia tura w tym samym wątku | OK |
| Guardrail INPUT (`BLOCK`) — odmowa | OK, ale patrz D-10 |
| **Guardrail OUTPUT (`BLOCK`) — wstrzymanie odpowiedzi** | **OK, pełne** |
| Admin `/guardrails`: lista, liczniki trafień, sekcja per-org | OK |
| Admin: utworzenie reguły OUTPUT przez UI, włączenie, edycja, usunięcie | OK |
| Panel `/organization/security`: zdarzenia guardrailowe | OK, patrz D-11 |
| 43 ekrany web + admin, status i brak ekranów błędu | OK |

### Faza D — dowód

Utworzyłem przez panel admina regułę `OUTPUT`/`BLOCK` na wzorzec
`zzqx-echo-withheld`, odczekałem 60-sekundowy cache reguł i zadałem pytanie, na
które mock odsyła ten token w odpowiedzi. Wynik:

- w wątku pojawia się komunikat *„Odpowiedź została wstrzymana, ponieważ pasuje
  do reguły ustawionej przez administratora Twojej organizacji"*,
- treść odpowiedzi nie dociera na ekran,
- **komunikat przeżywa przeładowanie strony** — w `messages` leży wiadomość
  `ASSISTANT` z treścią „The answer was withheld because it matched a rule set
  by your organization's administrator" i `metadata.guardrailBlocked`
  wskazującym regułę,
- `security_events` ma wpis `GUARDRAIL_BLOCKED` ze `stage: OUTPUT`,
- **dopasowany fragment nie wyciekł do metadanych zdarzenia** (sprawdzone
  zapytaniem: `metadata::text LIKE '%zzqx-echo-withheld%'` → `false`),
- zmiana reguły odłożyła się jako `ADMIN_SETTINGS_CHANGED`.

Regułę usunąłem po teście — baza `ragen_e2e` jest w stanie zaseedowanym.

Zrzuty: `web-92-output-guardrail-wstrzymana.png`,
`web-93-output-guardrail-po-12s.png`, `web-94-output-guardrail-po-reloadzie.png`,
`admin-02-guardrails.png`.

---

## Defekty

Kolejność według wagi.

### D-07 — `npm run web:e2e` nie startuje apps/api, a CI tak (wysoki)

Pierwszy przebieg dał dwie czerwone smoke'i i **160 testów p0–p3, które w ogóle
nie wystartowały** (projekt `authenticated` zależy od `smoke-auth`):

```
2 failed
  smoke-11-project-file-upload › upload a file to a project
  smoke-12-thread-export › export thread as Markdown triggers export API request
160 did not run
52 passed
```

Obie wyglądały na regresję: lista projektów nie pokazywała `E2E Test Project`,
sidebar nie pokazywał `E2E Seeded Thread`. Oba rekordy **są** w `ragen_e2e` z
poprawnym `organization_id`.

Przyczyna: `getProjects`
([actions.ts:60](../apps/web/src/app/components/Sidebar/Projects/actions.ts))
nie czyta bazy, tylko woła apps/api przez `/v1/internal/projects` (faza C
ADR-21). apps/web wskazywał na `ragen_e2e`, ale **apps/api na porcie 3001 był
procesem zastanym z 12:40, wystartowanym przeciw bazie `ragen`**.

`.github/workflows/e2e.yml:253-273` startuje apps/api jawnie, a komentarz w
liniach 58-62 wymienia dokładnie te dwa scenariusze jako te, które bez niego
padną. Lokalnie nic tego nie robi i nic nie ostrzega.

Po zatrzymaniu zastanego procesu i wystartowaniu apps/api przeciw `ragen_e2e`
oba przechodzą: `smoke-11` w 500 ms, `smoke-12` w 1,3 s.

Do naprawy: albo `web:e2e` startuje apps/api samo, albo `global.setup.ts`
sprawdza, przeciw jakiej bazie odpowiada 3001, i przerywa z czytelnym
komunikatem.

### D-08 — lokalne e2e dzwoni do prawdziwego dostawcy LLM (wysoki)

`LLM_ROUTES_PATH` jest ustawiane **wyłącznie w CI** (`e2e.yml:120`). Lokalnie
`.env.local` go nie ma, więc gateway rozwiązuje modele przeciw produkcyjnemu
`infra/llm-gateway/routes.yaml` i produkcyjnym poświadczeniom.

Skutki widoczne w logu przebiegu:

1. `Error [UnknownModelError]: no route for model "mock-model"` ×3 — tury, które
   miały trafić w mock, umierają.
2. Rephraser poszedł na **`mistral-small-3.2-24b-instruct-2506`** i dostał
   odpowiedź z `total_tokens: 249`. Mock raportuje 20 albo 1, więc to był realny,
   płatny call — z treścią pytania użytkownika w środku.

Czyli: lokalna suita e2e wysyła dane na zewnątrz i generuje koszt, a różnica
wobec CI sprowadza się do jednej niezapisanej zmiennej.
`tests/architecture/a-configured-route-table-path-is-absolute.test.ts` pilnuje
*kształtu* tej ścieżki, ale nie tego, że w ogóle jest ustawiona.

### D-09 — instrukcja asystenta zgłasza zapis, którego nie ma (wysoki)

`p0-22-projects › set and clear project system prompt / instructions` pada
deterministycznie (oba podejścia):

```
expect(locator).toHaveValue(expected) failed
Locator:  locator('[role="dialog"] textarea')
Expected: "You are a helpful test assistant. Always respond in Polish."
Received: ""
```

Sprawdzone w bazie: wiersz `project_settings` dla projektu **istnieje i ma
świeże `updated_at`** (16:10:49 i 16:10:56, czyli oba podejścia testu), ale
kolumna `instructions` jest **pusta**. Ścieżka zapisu wygląda poprawnie na
każdym poziomie: `saveProjectInstructionAction` wysyła `{ instruction }`, DTO
`SaveProjectInstructionDto` oczekuje `instruction`, a
`ProjectsService.saveProjectInstruction` robi `upsert` z
`update: { instructions: instruction }`.

To nie jest nowe odkrycie — komentarz w
[`ProjectInstructionForm.tsx:83`](../apps/web/src/app/components/Projects/ProjectInstructions/ProjectInstructionForm.tsx)
mówi to wprost: *„the value never reaches `project_settings.instructions` at
all, while the endpoint reports success"*. Rzecz w tym, że **diagnoza została
zapisana w komentarzu i na tym się skończyło**, a test jest w tierze `p0`,
który gatuje każdy PR.

Najmocniejsza hipoteza mechanizmu (nie potwierdzona, bo nie naprawiam):
`useEffect` w tym komponencie robi `reset({ description: result.instruction })`
po powrocie GET-a, a `submitSupersedesInitialLoad` chroni dopiero **po**
submicie. Kto otworzy dialog i zapisze szybciej, niż wróci GET, wysyła pusty
string. To by tłumaczyło i toast sukcesu, i dotknięty `updated_at`, i pustą
kolumnę.

### D-10 — po odmowie na wejściu wątek zostaje z pytaniem bez odpowiedzi (średni)

Guardrail `INPUT` działa: SSE zwraca
`event: error / {"code":"guardrail-blocked"}`, a panel pokazuje toast *„Wiadomość
nie została wysłana, ponieważ pasuje do reguły ustawionej przez administratora
Twojej organizacji"* (zrzut `web-90-odmowa-guardrail-toast.png`).

Ale toast jest **jedynym** śladem. Wiadomość użytkownika zostaje zapisana,
żadna wiadomość asystenta nie powstaje, i po przeładowaniu wątek wygląda jak
pytanie, na które asystent nigdy nie odpowiedział
(`web-91-watek-po-odmowie.png`). Sprawdzone w bazie: w wątku jest jeden wiersz
`USER` i zero `ASSISTANT`.

Asymetria wobec fazy D jest wyraźna: etap OUTPUT **utrwala** odmowę (D1 — „an
answer a rule stops is not an answer that is stored"), etap INPUT nie utrwala
nic. Kto wróci do wątku po godzinie, nie ma jak się dowiedzieć, dlaczego nie
dostał odpowiedzi.

Warto zauważyć, dlaczego `p0-29` tego nie łapie: asertuje `getByText(REFUSAL)`
w ciągu 20 s, czyli **łapie właśnie ten ulotny toast** i nic poza nim. Sam
zdiagnozowałem to najpierw źle — zrzut po 10 s pokazał pusty wątek i wyglądało
to jak całkowity brak renderowania; dopiero zrzut po 2 s pokazał toast.

### D-01 — dysk na 97 %, `.turbo` waży 8,9 GB (średni)

`/System/Volumes/Data`: 399 GiB użyte, **14 GiB wolne**. Największe pozycje:
`.turbo` 8,9 GB, `node_modules` 4,7 GB, `apps/web/.next` 4,6 GB,
`apps/admin/.next` 510 MB. `~/.claude/worktrees` nie istnieje.

To stan opisany w [lekcji o kaskadzie po zapełnieniu dysku](lessons.md): pełny
dysk psuje warstwę VM Dockera, zatruwa Turbopack i sprawia, że `verify` wywala
zadania przechodzące w izolacji. **Nic nie usuwałem** — `.turbo` i `.next` są
odtwarzalne z builda, ale to decyzja użytkownika.

### D-02 — nieśledzony `p0-30-output-guardrail-refusal.spec.ts` nie może przejść (średni)

`apps/web/e2e/p0-30-output-guardrail-refusal.spec.ts` (306 linii, nieśledzony)
zakłada zaseedowaną regułę `E2E guardrail OUTPUT BLOCK` ze wzorcem
`zzqx-echo-withheld`. Ta reguła nie istnieje — `e2e-seed.ts:566` tworzy dwie,
obie `stage: 'INPUT'`, co log seedowania potwierdza: *„Created guardrail
fixtures: one BLOCK, one LOG"*. Własny strażnik specyfikacji pada w 15 ms, trzy
testy odmowy lecą za nim.

Mock jest gotowy (`zzqx-echo` obsłużone w `mock-llm-server.ts`). Brakuje wpisu w
seedzie — dokładnie takiego, jaki ręcznie utworzyłem w panelu i który zadziałał
za pierwszym razem. **Regułę o tej nazwie widać w bazie w `security_events` z
2026-09-20 23:00–23:02** (trzy trafienia `stage: OUTPUT`), czyli podczas sesji
fazy D istniała, utworzona ręcznie, i została później skasowana przez
`deleteMany({ name: { startsWith: 'E2E guardrail' } })` w seedzie. Test został
napisany przeciw stanowi, którego seed nie odtwarza.

Poboczne: stała `HARMLESS` jest zadeklarowana i nieużywana, a komentarz na końcu
pliku sam mówi, że kontroli („odpowiedź, której nic nie dopasowuje, dociera na
ekran") świadomie nie ma.

### D-12 — panelu admina nie da się zalogować przy dokumentowanym setupie (średni)

AGENTS.md mówi: *„One `.env.local` at the repository root serves every app"*.
Ale `BETTER_AUTH_URL` może trzymać tylko jeden origin, a root `.env.local` ma
`http://localhost:3000`. apps/admin nie ustawia własnego `baseURL` ani
`trustedOrigins` w `betterAuth()`, więc logowanie na `:3200` kończy się
**„Sign-in failed: Invalid origin"**. apps/admin nie ma własnego `.env.local`,
tylko `.env.example`.

Że to jest znane, widać po `admin-e2e.yml:35-36`, który ustawia
`BETTER_AUTH_URL: 'http://localhost:3200'`. Brakuje tego w dokumentacji setupu —
kto pójdzie za AGENTS.md, dostanie panel, do którego się nie zaloguje.

### D-05 — tenant-scope-guard ostrzega z obu aplikacji (informacyjny, znany dług)

Z logu apps/web w drugim przebiegu e2e:

| Model | Wystąpienia |
|---|---|
| `Member` | 61 |
| `Team` | 3 |
| `McpConnector` | 2 |
| `Invitation` | 2 |

Osobno z apps/api: `Thread.update`, `Project.findUnique`, `Project.update`,
`McpConnector.upsert`. Strażnik z założenia tylko ostrzega, więc to nie awaria —
to widok na backlog ze skilla `ragen-tenant-scope-audit`. Dominacja `Member`
sugeruje jedno–dwa miejsca wołane z layoutu, nie 61 usterek.

### D-11 — drobiazgi i18n / a11y (niski)

Zebrane po drodze, wszystkie odtwarzalne na zrzutach:

1. **`MISSING_MESSAGE: prompt-attachments.add-attachment (pl)`** — rzucane w
   konsoli dziesiątki razy przy każdym renderze kompozytora. Na `/new` przycisk
   ma `aria-label` „Add attachment" (angielski w polskim UI), a w wątku surowy
   klucz i18n.
2. **Przycisk wysyłania w kompozytorze wątku nie ma dostępnej nazwy** —
   `aria-label: null`, pusty tekst.
3. **`/organization/security`**: kolumna `Zdarzenie` pokazuje surowe enumy
   (`GUARDRAIL_BLOCKED`, `GUARDRAIL_FLAGGED`), podczas gdy sąsiednia `Waga` jest
   przetłumaczona („Ostrzeżenie", „Info").

### D-06 — lista regresji manualnej nie zna etapu OUTPUT (niski)

`docs/regression-checklist.md` ma jedną pozycję o guardrailach (linia 219,
jailbreak na wejściu). Po fazie D brakuje scenariusza „odpowiedź wstrzymana
przez regułę OUTPUT" — czyli akurat tego, którego tryb awarii jest cichy.
Scenariusz z sekcji 4 tego raportu nadaje się do przepisania tam wprost.

### D-03 — kolizja numeracji `p0-30` (niski)

`p0-30-connector-allowlist.spec.ts` (w repo) i
`p0-30-output-guardrail-refusal.spec.ts` (nieśledzony) mają ten sam numer.

### D-04 — 429 z `/v1/internal/notifications` (do potwierdzenia)

W **pierwszym** przebiegu layout dostawał `429 ThrottlerException` przy każdym
renderze strony; błąd jest logowany i połykany, a użytkownik widzi brak
powiadomień nieodróżnialny od „nie masz powiadomień". W **drugim** przebiegu, ze
świeżo wystartowanym apps/api, to nie wystąpiło — więc źródłem był
najprawdopodobniej 5,5-godzinny proces zastany. Zostawiam jako obserwację: warto
sprawdzić, czy limit throttlera jest realistyczny dla calla wykonywanego przy
każdym renderze, ale **nie jest to potwierdzony defekt**.

---

## Czego świadomie nie zrobiłem

- **Nie naprawiałem niczego i nie commitowałem** — zgodnie z zakresem. Jedyne
  nowe pliki to ten raport i katalog zrzutów.
- **Nie dotknąłem bazy `ragen`** (deweloperskiej) — nie mam do niej konta, a
  jedyne, jakie tam są, to prawdziwe konta. Cały przegląd stoi na `ragen_e2e` i
  koncie `e2e-test@ragen.ai`, którego dane są stałymi w repo.
- **Nie usunąłem `.turbo` ani `.next`** mimo D-01 — 14 GiB starczyło na ten
  przebieg, a kasowanie 13 GB z cudzego dysku to nie moja decyzja.
- **Nie uruchomiłem workera ani ścieżki ingestu dokumentów** — sekcja „Worker
  runtime" z listy regresji wymaga osobnego przebiegu per `WORKER_RUNTIME` i nie
  mieści się w tym.
- **Nie sprawdziłem retrieval RAG** — `ragen_e2e` nie ma wektorów w Qdrancie,
  więc każde pytanie do bazy wiedzy i tak nie miałoby czego znaleźć. Przegląd
  czatu szedł na zakresie „Sam model".
## Stan środowiska po przebiegu

- **apps/api działa na 3001 przeciw bazie `ragen`** — tak jak przed przebiegiem.
  Proces zastany (wystartowany 12:40 przeciw `ragen`) musiałem zatrzymać na czas
  e2e i wystartowałem go z powrotem na domyślnym środowisku.
- **Serwery przeglądowe zatrzymane**: apps/web (3000), apps/admin (3200) i mock
  LLM (4100) chodziły tylko na czas przeglądu, przeciw `ragen_e2e`. Zgasiłem je,
  żeby nikt nie wziął danych e2e za deweloperskie.
- **`ragen_e2e` jest w stanie zaseedowanym** — regułę `Manual OUTPUT BLOCK
  2026-09-21`, którą utworzyłem do testu fazy D, usunąłem przez panel. Zostały
  wątki czatu z przeglądu, które i tak kasuje następny seed.
- **Nic nie zacommitowane.** Nowe pliki: ten raport, katalog zrzutów,
  `docs/lessons/local-e2e-diverges-from-ci-in-two-silent-ways.md` i jeden punkt
  w katalogu `docs/lessons.md`.
