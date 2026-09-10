# Ragen vs PrivateGPT, Onyx, DocsGPT

**Analiza konkurencji, plan produktowy, plan zdobywania gwiazdek i nowe copy**
Data: 10 września 2026

Źródła danych: strony produktowe i repozytoria trzech konkurentów (stan na 10.09.2026), `README.md`, `docs/` i historia gita w `ragen-app`, strona ragen.ai (PL i EN) oraz cennik.

---

## 0. Punkt startowy, czyli z czym naprawdę porównujemy Ragen

Jedna rzecz do ustalenia na wejściu: to nie są trzy takie same projekty. Porównywanie Ragen do wszystkich naraz prowadzi do wniosku "brakuje nam wszystkiego", co jest nieprawdą.

| | Ragen | PrivateGPT | Onyx | DocsGPT |
|---|---|---|---|---|
| Gwiazdki | **1** | 57,5k | 32k | 18,2k |
| Forki | 0 | 7,6k | 4,4k | 2,1k |
| Otwarte issues | 0 | 1 | 127 | 22 |
| Commity | 3 434 | 430 | 10 019 | 5 066 |
| Licencja | Apache 2.0 | Apache 2.0 | MIT (CE) + EE | MIT |
| Język | TypeScript | Python | Python + TS | Python |
| Czym to jest | platforma RAG z UI, API i multi-tenancy | warstwa API nad lokalnymi modelami | platforma czatu z 40+ konektorami | platforma agentów i wyszukiwania |
| Model komercyjny | brak (na razie) | Zylon: dystrybucja enterprise + appliance | cloud 20 USD/user/mies. + Enterprise | cloud free/20 USD + self-host + on-prem |
| Chmura publiczna | nie | nie | tak | tak |

Praktyczny wniosek z tej tabeli:

- **PrivateGPT to nie jest nasz konkurent produktowy.** 430 commitów, 1 otwarte issue, i pozycjonowanie "complete API layer for private AI applications on local models". Oni nie mają UI, knowledge base ani multi-tenancy. Ich 57,5k gwiazdek to majątek z maja 2023, kiedy "chat with your docs offline" był nowością. Traktujmy ich jako wzorzec dystrybucji i jako partnera w narracji, nie jako produkt do dogonienia funkcjami.
- **Onyx to nasz realny konkurent.** Ta sama kategoria, ten sam kupujący, 10 tysięcy commitów, 40+ konektorów, opublikowane benchmarki, SOC 2 Type II, case study z liczbą (Ramp, 30x ROI). Jeśli klient w Europie porównuje open source RAG, porównuje z nimi.
- **DocsGPT to wzorzec budowania społeczności.** Funkcjonalnie są bliżej nas niż Onyx, ale 18,2k gwiazdek zrobili mechaniką community: Hacktoberfest, graf kontrybutorów, Discord, Lighthouse Program, roadmapa w README, logotypy klientów. To jest ścieżka, którą Ragen może powtórzyć. Ścieżki PrivateGPT nie da się powtórzyć.

---

## 1. Analiza konkurencji

### 1.1 Czego oni mają, a czego my nie mamy

Podzielone na to, co blokuje sprzedaż, i to, co blokuje gwiazdki. Te dwie listy są różne i mylenie ich to najczęstszy błąd w takich analizach.

#### Blokuje sprzedaż do firmy

| Luka | Kto to ma | Dlaczego to boli |
|---|---|---|
| **SSO (OIDC, SAML, Entra ID, SCIM) i MFA** | DocsGPT (OIDC), Onyx (EE) | `docs/security-and-privacy.md:150` mówi wprost: "Not built yet". Cennik na stronie sprzedaje SSO jako Enterprise, więc obiecujemy coś, czego nie ma. W firmie powyżej 100 osób to jest pytanie numer jeden w checklistcie IT. |
| **Konektory Microsoft: SharePoint, OneDrive, Outlook, Teams** | Onyx, DocsGPT (SharePoint/OneDrive) | Europejskie firmy średnie i duże siedzą na Microsoft 365. Mamy Google Workspace, Gmail, Slack, HubSpot, ClickUp, Fireflies, WooCommerce. To jest stack startupu, nie stack Omega Pilzno ani BSH. |
| **Confluence, Jira, Zendesk, Salesforce, GitHub** | Onyx | Baza wiedzy w firmie technologicznej mieszka w Confluence. Bez tego konektora rozmowa kończy się na "to musimy eksportować ręcznie". |
| **Dziedziczenie uprawnień ze systemów źródłowych** | Onyx (permission inheritance) | My wymuszamy własne ACL przy retrievalu, co jest technicznie mocniejsze, ale wymaga ręcznego ustawienia. Onyx zasysa uprawnienia z Google Drive i SharePointa. Kupujący pyta: "czy to samo się zgra z naszym AD?". |
| **Certyfikacja, nie gotowość** | Onyx (SOC 2 Type II) | Nasza strona pisze "compliance ready" dla GDPR, NIS2, DORA, SOC2, HIPAA. Audytor czyta "ready" jako "nie mamy". |
| **Publiczne case study z nazwą klienta** | Onyx (Ramp), DocsGPT (logotypy: Amazon, Microsoft, Siemens, Deloitte, PwC, AstraZeneca, HM Government) | Mamy jedną liczbę na stronie ("z 12 godzin do poniżej 40 minut") bez nazwy klienta. To najtańsza rzecz do naprawy na tej liście. |
| **Publiczne benchmarki jakości** | Onyx (64% win rate vs ChatGPT, 68,1% vs Claude, 76% vs Notion AI) | To jest nasza największa strata, bo my mamy narzędzia (5 suit promptfoo + `evals/e2e-rag`), a nie mamy wyników. README obiecuje "retrieval that was measured, not assumed", a `docs/rag-roadmap-status.md` przyznaje, że tydzień pomiarowy z ADR-20 nie został przeprowadzony na obecnym stacku. Obiecujemy pomiar, którego nie pokazujemy. |

#### Blokuje gwiazdki

| Luka | Kto to ma | Dlaczego to boli |
|---|---|---|
| **Kanał społeczności** | wszyscy trzej (Discord) | W naszym README są dwa `TODO(community)`. Nie ma Discorda, nie ma Discussions. Człowiek, który uruchomi Ragen i utknie, nie ma gdzie zapytać, więc odchodzi. |
| **Badge'y w README** | wszyscy trzej | `TODO(badges)` w README. Brak licencji, CI, docs, npm, Discorda. Badge'y to pierwszy sygnał "ten projekt żyje". |
| **GIF demo na górze README** | Onyx, DocsGPT | Mamy statyczne screeny, i cztery z nich to cele design systemu v2, a nie obecny interfejs (README to przyznaje). Ktoś, kto porówna screeny z demo.ragen.ai, zobaczy dwie różne aplikacje i straci zaufanie. |
| **Python SDK i `pip install`** | PrivateGPT, DocsGPT | Publiczność GitHuba w kategorii AI to Python. Mamy tylko `@webamigos/ragen-sdk-ts`. |
| **Instalacja jednym poleceniem bez klonowania repo** | PrivateGPT (per OS), DocsGPT (pip, docker) | `npm run ragen:up:everything` wymaga sklonowania monorepo. Czas do pierwszej odpowiedzi to metryka, która konwertuje gwiazdki. |
| **Darmowa chmura do przetestowania** | DocsGPT (Free, 1 user), Onyx (trial) | Mamy demo.ragen.ai z zaseedowaną organizacją, więc nie da się wrzucić własnego PDF-a. |
| **`good first issue`, graf kontrybutorów, Hacktoberfest** | DocsGPT | Zero otwartych issues to nie jest zaleta w OSS, to znaczy "nie ma tu nic do zrobienia, idź dalej". |
| **Publiczna roadmapa** | DocsGPT (do czerwca 2026) | Mamy roadmapę w `docs/`, ale wewnętrzną i częściowo nieaktualną. |
| **Bot w Slacku jako powierzchnia czatu** | Onyx, DocsGPT (Discord, Telegram, Chatwoot) | Mamy Slacka jako konektor danych przez MCP, nie jako miejsce, gdzie ludzie rozmawiają z asystentem. To jest główny mechanizm, którym Onyx rozchodzi się wewnątrz firmy. |
| **Diagram architektury w README** | DocsGPT | Mamy `docs/flowchart.mermaid` i `docs/architecture.md`, ale w README są tylko linki. |
| **Badge OpenSSF Best Practices** | DocsGPT | Kilka godzin pracy, wieczna wiarygodność w oczach audytora i self-hostera. |

#### Funkcje, których nie mamy, i decyzja co z nimi

| Funkcja | Kto | Decyzja |
|---|---|---|
| Deep research, wieloetapowe badanie | Onyx, DocsGPT | **Zrobić.** To już jest standard, brak wygląda na zaległość. |
| Web search jako narzędzie | Onyx, DocsGPT | **Zrobić.** Tanie przez MCP, zamyka najczęstsze pytanie na demo. |
| Builder workflow z węzłami i webhookami | DocsGPT | **Nie kopiować.** Zamiast tego wzmocnić warstwę MCP z zatwierdzaniem akcji i audytem. Różnicujmy się governance, nie liczbą węzłów. |
| GraphRAG, knowledge graph | Onyx, DocsGPT | **Odpuścić.** Drogie, słabo udowodnione przy Q&A na dokumentach, i kłóci się z pozycjonowaniem "mierzymy, nie zakładamy". |
| Code interpreter w sandboxie | Onyx | **Odpuścić.** |
| Generowanie obrazów, tryb głosowy | Onyx | **Odpuścić.** Onyx to robi, bo sprzedaje zamiennik ChatGPT na stanowisko. Nasz kupujący to osoba odpowiedzialna za wdrożenie, która chce udowodnionej kontroli. |
| Aplikacja mobilna, desktop, CLI | Onyx | **Odpuścić na teraz.** |
| Chmura SaaS | Onyx, DocsGPT | **Zgodnie z wcześniejszą decyzją: odłożone.** Wyjątek niżej: darmowy sandbox to nie SaaS. |

### 1.2 Co my mamy, czego oni nie mają

To jest krótsza lista, ale mocniejsza, i obecnie prawie w ogóle nie jest komunikowana.

**1. Uprawnienia wymuszane przy retrievalu, w otwartym rdzeniu.**
Każdy chunk nosi filtr `accessible_by` stosowany w momencie zapytania. Dokument, do którego użytkownik nie ma dostępu, nie trafi do odpowiedzi, do cytowania ani do kontekstu wysłanego do modelu. U Onyxa RBAC jest w płatnym planie Business, u DocsGPT kontrola dostępu to funkcja enterprise. My mamy to w Apache 2.0. **To jest najmocniejsza rzecz, jaką mamy, i nie ma jej na stronie głównej.**

**2. Multi-tenancy jako element architektury, nie dodatek.**
Jedna kolekcja Qdranta na organizację, tenant-scope guard w warstwie Prismy nad około 20 modelami, dwie rozdzielone hierarchie ról. Onyx i DocsGPT są w praktyce jednoorganizacyjne w wersji open source. Dla nas to znaczy jedno konkretne: **partner albo MSP może postawić jedną instancję i obsługiwać na niej wielu klientów.** To jest gotowy program partnerski, którego konkurencja nie może zaoferować bez przepisania architektury.

**3. Stack TypeScript.**
Wszyscy trzej to Python. Dla firmy, która ma zespół Next.js i NestJS, Ragen jest jedyną opcją, w której da się coś samemu zmienić. To jest też realna nisza dystrybucyjna na GitHubie: nie ma poważnej platformy RAG w TypeScripcie.

**4. Wielojęzyczność, której nikt nie kontestuje.**
Interfejs w 15 językach, w tym polski, węgierski, bułgarski, ukraiński, czeski, słowacki, duński, szwedzki, fiński. Retrieval na `bge-multilingual-gemma2` z rerankingiem `qwen3-embedding-8b`. Żaden z trzech nie reklamuje jakości wyszukiwania w językach innych niż angielski. **Tu można zostać projektem, który się cytuje.**

**5. Routing modeli przez własne LiteLLM, z realną ścieżką europejską.**
Scaleway, Azure OpenAI, Bedrock, Vertex, OpenRouter albo własne GPU. Zmiana dostawcy to plik konfiguracyjny. Onyx i DocsGPT domyślnie prowadzą do dostawców z USA.

**6. Szyfrowanie na poziomie rozmowy.**
AES-256-GCM w modelu envelope, jeden klucz na rozmowę, opcjonalnie. Nie ma tego w otwartym rdzeniu żadnego z trzech.

**7. Maskowanie PII przy ingest przez Presidio.**
Udokumentowane, z flagą, i z lekcją z incydentu, kiedy flaga była wyłączona i maskowanie po cichu się nie wykonało.

**8. Token vault jako osobna usługa.**
Tokeny OAuth nigdy nie leżą w bazie aplikacji. Cztery style uwierzytelniania konektorów, w tym OAuth z PKCE. To jest rzecz, którą docenia dokładnie ten człowiek, który podpisuje umowę.

**9. Wersjonowanie dokumentów z diffem i rollbackiem.**
Plus reindeksacja przy zmianie treści i sugestie optymalizacji RAG do zatwierdzenia. Nikt z trzech tego nie reklamuje.

**10. Ragen jest serwerem MCP, nie tylko klientem.**
`apps/mcp` wystawia asystenta Ragen jako narzędzie MCP dla Claude Desktop czy Cursora, na tym samym kluczu API co REST. Onyx ma akcje MCP po stronie klienta. Bycie serwerem to inna rzecz i **daje wejście na listy MCP, które mają dziś duży ruch.**

**11. Log audytowy ze stanem przed i po, w rdzeniu.**
U Onyxa audit logging jest w Enterprise.

**12. Repozytorium, w którym agent kodujący jest użyteczny pierwszego dnia.**
42 ADR-y, `AGENTS.md` jako kanoniczny brief, pięć skilli repo-specyficznych, testy architektury, które wywalają build przy złamaniu reguły, i `docs/lessons/` z incydentami, które kazały te reguły zapisać wykonywalnie. **Żaden projekt RAG tego nie ma, a w 2026 to jest temat, który się roznosi.**

**13. Dokument bezpieczeństwa, który mówi, gdzie jest zależne od konfiguracji.**
`docs/security-and-privacy.md` przyznaje wprost dwie rzeczy: parsowanie jest lokalne, ale ma fallback wysyłający PDF-y na zewnątrz, i szyfrowanie at rest jest opt-in. Konkurencja takich zdań nie pisze. W rozmowie z bezpieczeństwem to działa lepiej niż marketing.

**14. Compliance po europejsku.**
NIS2 i DORA. Żaden z trzech nawet ich nie wymienia. To jest wąska szczelina, w której nie ma tłoku.

**15. Zmierzony budżet zasobów i brak GPU.**
Około 2,6 GB w bezczynności, tabela per usługa, i wyraźne "GPU nie jest potrzebne". Onyx ma tryb Lite pod 1 GB, więc nie wygrywamy tej liczby, ale wygrywamy precyzją i uczciwością.

### 1.3 Jedna rzecz, którą trzeba naprawić natychmiast

**Repozytorium i strona sprzedają dwa różne produkty.**

Opis repo: "Open-Source RAG Platform for Companies. Knowledge bases with multilingual retrieval and reranking, answers traceable to the source document, and a public API."

Strona główna: "AI That Knows Your Business Inside Out", nagłówek "Twój zespół przestanie tracić 2h dziennie na szukanie informacji", jedno CTA: "Umów konsultację".

Na stronie nie ma słowa "open source" w nagłówku, nie ma linku do GitHuba w widocznym miejscu, nie ma ścieżki "uruchom u siebie". Ktoś, kto trafi z GitHuba na ragen.ai, widzi lejek konsultingowy. Ktoś, kto trafi ze strony na GitHuba, widzi inny produkt. To kosztuje na obu kierunkach. Sekcja 4 rozwiązuje to copy.

Dodatkowo, dwie rzeczy do poprawienia w README przed premierą, bo są sprawdzalne i podważają resztę:

- README mówi "Thirty-four ADRs", w `docs/adrs/` jest ich **42**.
- Cztery screeny panelu to cele design systemu v2, nie obecny interfejs. README to przyznaje, ale przyznanie jest pod obrazkami, a nie nad nimi.

---

## 2. Co warto u nas zaimplementować

Priorytety ustawione po jednym kryterium: co odblokowuje najwięcej wdrożeń i gwiazdek na jednostkę pracy.

### Tier 1: przed premierą open source (2 do 4 tygodni)

**1. Uruchomić tydzień pomiarowy z ADR-20 i opublikować wyniki.**
Mamy narzędzia i nie mamy liczb. To jedyna pozycja na tej liście, która jest jednocześnie funkcją, materiałem marketingowym i spłatą długu. Zakres minimalny: suity promptfoo plus `evals/e2e-rag` na obecnym stacku Scaleway, na publicznym zbiorze dokumentów, wynik w repo, skrypt do powtórzenia u siebie. Onyx publikuje win rate vs ChatGPT. My możemy opublikować coś mocniejszego: **eval, który każdy odtworzy na swoich dokumentach.**

**2. Python SDK i klient `pip install`.**
Publiczność GitHuba w AI to Python. Bez tego tracimy większość ruchu z każdego wątku na Reddicie i HN.

**3. Bot Slacka jako powierzchnia rozmowy.**
Najwyższy stosunek adopcji do pracy z całej listy braków. To także mechanizm, którym Onyx rozchodzi się wewnątrz organizacji: jedna osoba wdraża, dwadzieścia zaczyna używać, bo asystent jest tam, gdzie już piszą.

**4. Zamknąć oba `TODO` z README: kanał społeczności i badge'y.**
Discussions wystarczą na start, Discord jeśli jest ktoś, kto go dopilnuje. Badge'y: Apache 2.0, CI, docs, npm, Discord, OpenSSF Best Practices.

**5. GIF demo na górze README, na prawdziwym interfejsie.**
Piętnaście do dwudziestu sekund: wrzucenie PDF-a, pytanie, odpowiedź z cytowaniem. Cztery aspiracyjne screeny panelu albo zamienić na wygenerowane, albo opisać nad obrazkiem, nie pod.

**6. Skrócić czas do pierwszej odpowiedzi.**
Jedno `docker run` albo `npx` bez klonowania monorepo. Do tego darmowy sandbox, w którym można wrzucić własny plik i który sam się czyści. To nie jest SaaS, to jest demo, które działa.

**7. Piętnaście do dwudziestu prawdziwych `good first issue` z plikami i kryteriami odbioru.**
`AGENTS.md` daje nam tu przewagę, której nikt nie ma: możemy uczciwie napisać, że **pierwszy PR w tym repo da się zrobić agentem kodującym, bo reguły są zapisane i wymuszane przez CI.**

### Tier 2: pierwszy kwartał po premierze

**8. Konektory Microsoft: SharePoint, OneDrive, Outlook, Teams. Potem Confluence i Jira.**
To jest lista, która odblokowuje europejskie firmy średnie i duże. Kolejność po realnym zapotrzebowaniu z pipeline'u, nie po alfabecie.

**9. Synchronizacja uprawnień ze systemów źródłowych do `accessible_by`.**
To zamienia naszą najmocniejszą funkcję z twierdzenia w rzecz, którą klient sprawdza w pięć minut. Onyx to ma, ale sprzedaje kontrolę dostępu w płatnym planie. **My możemy mieć dziedziczenie uprawnień w Apache 2.0, i to jest zdanie, po którym rozmowa z konkurencją się kończy.**

**10. SSO przez OIDC w otwartym rdzeniu.**
Argument jest nasz własny: w `README` piszemy "security is not an upsell", a kontrola dostępu jest core. SSO to kontrola dostępu. Trzymanie go za paywallem jest niespójne z naszymi trzema zobowiązaniami z sekcji "Open core", a jednocześnie blokuje self-hosterów, którzy są źródłem gwiazdek. SAML i SCIM mogą zostać na później, OIDC nie.

**11. Web search i deep research jako narzędzia przez MCP.**
Standard w kategorii. Przez MCP tanie.

**12. Przepis na instalację całkowicie odciętą od internetu.**
Ollama albo vLLM, lokalne embeddingi, `DOCLING_STRICT=1`, `ENCRYPTION_PROVIDER` ustawiony, plus **skrypt, który udowadnia zero ruchu wychodzącego.** To jest funkcja i materiał marketingowy w jednym, i to jest jedyna rzecz, na której da się wygrać z PrivateGPT na jego własnym terenie (r/LocalLLaMA, r/selfhosted).

### Tier 3: świadomie nie robimy

Generowanie obrazów, tryb głosowy, code interpreter, GraphRAG, builder workflow z węzłami, aplikacja mobilna i desktopowa, chmura SaaS. Każda z nich obsługuje kupującego, którego nie mamy, i rozmywa pozycjonowanie, które mamy.

---

## 3. Jak Ragen może zdobyć gwiazdki na GitHubie

### 3.1 Czego uczą trzy trajektorie

- **PrivateGPT: 57,5k z jednego momentu.** Maj 2023, "chat with your docs offline", kiedy nic innego tego nie robiło, plus rekomendacje od sąsiadów w ekosystemie (Harrison Chase z LangChain, LlamaIndex, Qdrant). 430 commitów. **Tego nie da się powtórzyć.** Da się natomiast powtórzyć jedno: **oni zdobyli cytaty od projektów, których używali.**
- **Onyx: 32k z bycia domyślną odpowiedzią.** "Open source alternative to Glean", nieustanne dokładanie konektorów, obecność w Slacku, opublikowane benchmarki, wiarygodność enterprise. To ścieżka na dwa lata i na zespół.
- **DocsGPT: 18,2k z mechaniki społeczności.** Hacktoberfest, graf kontrybutorów, `good first issue`, Discord, Lighthouse Program, roadmapa w README, logotypy klientów. **To jest ścieżka do skopiowania.**

### 3.2 Faza 0: uporządkować repo (2 tygodnie, przed jakąkolwiek promocją)

Nie ma sensu kierować ruchu na repo, które go nie skonwertuje. Kolejność ma znaczenie.

- Pierwszy ekran README: jedno zdanie, co to jest, badge'y, GIF demo, trzy linijki quickstartu. Sekcja "Crafted by hand. Extended by agents." jest bardzo dobra, ale niech będzie druga, nie pierwsza.
- Poprawić liczbę ADR-ów (42) i status aspiracyjnych screenów.
- Discussions albo Discord, podlinkowane w README, docs i na stronie.
- `CONTRIBUTING.md` ze ścieżką dziesięciominutową, bez Dockera dla zmian w dokumentacji.
- Publiczna roadmapa: GitHub Project albo sekcja w README.
- Badge OpenSSF Best Practices.
- 15 do 20 issues z etykietami `good first issue` i `help wanted`, każde z plikami i kryterium odbioru.
- Odpowiadać na każde issue w ciągu 24 godzin przez pierwsze trzy miesiące. To najsilniejszy sygnał retencji w OSS i nic go nie zastąpi.

### 3.3 Faza 1: premiera (jeden tydzień)

Premiera nie może brzmieć "zrobiliśmy platformę RAG". Takich jest trzysta. Trzeba wybrać jeden klin. Trzy kandydaci, w kolejności siły:

**A. "Uprawnienia sprawdzamy przy wyszukiwaniu, nie w interfejsie."**
Materiał: dwóch użytkowników, to samo pytanie, dwie różne odpowiedzi, plus zrzut kontekstu wysłanego do modelu, który pokazuje, że zakazany fragment tam nie wszedł. Sprawdzalne, techniczne, i dotyczy strachu, który każdy w tej kategorii ma. **To jest główny nagłówek premiery.**

**B. "Repozytorium, w którym twój agent kodujący jest użyteczny pierwszego dnia."**
42 ADR-y, `AGENTS.md`, skille repo, testy architektury wywalające build. Temat gorący w 2026, żaden projekt RAG go nie ma. **To jest drugi post, na X i HN, i on przyprowadza programistów.**

**C. "Wielojęzyczny RAG, który naprawdę działa po polsku i w CEE."**
Opublikowany eval na 15 językach. Nisza bez konkurencji. **To jest trzeci post, i on przyprowadza cytowania.**

Kanały, w kolejności trafności dla tej kategorii:

| Kanał | Co tam wysłać | Uwaga |
|---|---|---|
| Show HN | klin A | wtorek do czwartku, rano czasu USA, autor obecny w komentarzach przez 6 godzin |
| r/selfhosted | przepis na instalację odciętą od internetu | największa publiczność dla tej kategorii |
| r/LocalLLaMA | to samo, z Ollamą | wymaga, żeby przepis naprawdę działał bez wyjścia na zewnątrz |
| r/opensource, Lobste.rs | klin B | |
| X, wątek | klin B | |
| LinkedIn | klin A po polsku | to przyprowadza kupujących, nie gwiazdki, i to jest w porządku |
| dev.to, Hashnode | klin C | długi ogon SEO |

Listy i katalogi, do których warto wejść w tym samym tygodniu: `awesome-selfhosted`, `awesome-rag`, `awesome-mcp-servers` (jesteśmy serwerem MCP, ta lista ma duży ruch i niski próg wejścia), `awesome-nextjs`, `awesome-llm-apps`, AlternativeTo (jako alternatywa dla Glean, Onyx i NotebookLM), OpenAlternative, Product Hunt, rejestry MCP.

**Strony porównawcze na docs.ragen.ai: "Ragen vs Onyx", "Ragen vs PrivateGPT", "Ragen vs DocsGPT".** Rankują i konwertują. Warunek wiarygodności: napisać uczciwie, gdzie oni wygrywają. PrivateGPT robi dokładnie to w swoim README, i to działa. My mamy do tego lepszy materiał niż większość, bo mamy tabelę porównawczą w README.

### 3.4 Ekosystem, czyli najbardziej niedoceniana dźwignia

PrivateGPT zdobył cytaty od Qdranta, LlamaIndex i LangChain. My używamy **Qdranta, LiteLLM, Docling, Temporala, Presidio i Scaleway**, i żaden z nich nie ma flagowej referencji na stacku TypeScript.

Konkretne zagrania, od najłatwiejszego:

1. **Scaleway.** Europejska chmura szukająca historii o suwerenności danych. Ragen na Scaleway z `bge-multilingual-gemma2` i `qwen3-embedding-8b` to gotowy case study dla ich bloga. Jeden taki wpis jest wart więcej niż dziesięć wątków na Reddicie, i jest realnie osiągalny.
2. **Qdrant.** Gościnny wpis o hybrydowym wyszukiwaniu z RRF po stronie serwera plus filtry uprawnień w payloadzie. Qdrant prowadzi bloga z takimi tekstami.
3. **Temporal.** Case study o ingest jako workflow. Temporal aktywnie szuka przykładów poza fintechem.
4. **Docling i Presidio.** Showcase, plus zgłoszenie do ich list integracji.
5. **LiteLLM.** Wpis integracyjny w ich dokumentacji.

Do tego: kontrybucje z powrotem do tych projektów, z Ragenem w śladzie commitów.

### 3.5 Faza 2: utrzymanie (na stałe)

- **Wydawać co tydzień, z prawdziwym changelogiem.** Wzrost gwiazdek chodzi za widoczną aktywnością.
- **Publikować wyniki evalu regularnie.** Cel: zostać projektem, który się cytuje przy jakości wielojęzycznego RAG.
- **Hacktoberfest 2026.** Październik jest za trzy tygodnie. DocsGPT tym zbudował sporą część swojego grafu kontrybutorów. Trzeba mieć 30 przygotowanych issues zanim się zacznie.
- **Program partnerski oparty na multi-tenancy.** Jedna instancja, wielu klientów, dla trenerów AI i software house'ów w Polsce i CEE. Konkurencja nie może tego zaoferować bez przepisania architektury. To jest jednocześnie dystrybucja i przychód.

### 3.6 Czego oczekiwać, uczciwie

Przy zdyscyplinowanej realizacji i jednym dobrym dniu na HN: **300 do 700 gwiazdek w trzy miesiące, 1 do 3 tysięcy w rok.** Osiemnaście tysięcy jak DocsGPT to dwa lata mechaniki społeczności, a 57 tysięcy jak PrivateGPT to moment, który się nie powtarza. Warto to zapisać teraz, żeby za kwartał nie ocenić dobrego wyniku jako porażki.

I rzecz, o którą łatwo się potknąć: **gwiazdki nie są celem, są proxy.** Lejek, który się liczy, wygląda tak: gwiazdki, self-hosterzy, "potrzebujemy pomocy z SharePointem i uprawnieniami z AD", umowa utrzymaniowa. Repo warto ułożyć tak, żeby self-hoster dochodził dokładnie do tej ściany, przy której płatna pomoc ma sens, i żeby ta ściana była opisana wprost, a nie ukryta.

---

## 4. Nowe copy na ragen.ai

### 4.1 Co jest nie tak z obecnym copy

Diagnoza po porównaniu z trzema konkurentami:

1. **Nie ma słowa "open source" w nagłówku.** Wszyscy trzej mają je w pierwszym zdaniu. Onyx: "Onyx is the open-source AI chat connected to your docs, apps, and people." DocsGPT: "Open-source AI platform to securely deploy intelligent agents...". PrivateGPT ma jako nagłówek liczbę gwiazdek.
2. **Jedno CTA, i to konsultacja.** Każdy konkurent ma dwie ścieżki: spróbuj teraz i porozmawiaj z nami. U projektu open source ścieżka "spróbuj" musi być pierwsza.
3. **Liczba w nagłówku bez źródła.** "2 godziny dziennie" czyta się gorzej niż brak liczby. Onyx podaje swoje liczby z benchmarkiem i nazwanym klientem.
4. **Listy funkcji to przymiotniki.** "Blazing Fast Responses", "Gets Smarter Over Time", "Your Brand, Your Voice". Każde z tych zdań da się przenieść do dowolnego innego produktu bez zmiany znaczenia. Copy z README jest znacznie lepsze i konkretniejsze niż copy ze strony.
5. **Lista modeli się zestarzeje.** GPT-5.2, Gemini 3 Flash, Claude Sonnet 4.6 na stronie to kwartał życia, a przy okazji podważa komunikat "bez vendor lock-in", bo pokazuje krótką listę.
6. **"Compliance ready" dla SOC2 i HIPAA.** Audytor czyta to jako "nie mamy". Lepiej napisać, co robimy, i pozwolić mu to zmapować.
7. **"Dla kogo" jest linkiem w stopce, nie sekcją.**

Co zostawić bez zmian: konkretny wynik ("z 12 godzin do poniżej 40 minut"), siatkę integracji, sekcję panelu administracyjnego, kontrast europejski.

### 4.2 Hero, dwa warianty

#### Wariant A, rekomendowany: klin uprawnień

**PL**

> # AI, które nie pokaże pracownikowi dokumentu, do którego nie ma dostępu
>
> Ragen to otwarta platforma RAG dla firm. Uprawnienia sprawdzamy przy wyszukiwaniu, nie w interfejsie: dokument bez dostępu nie trafi ani do odpowiedzi, ani do cytowania, ani do promptu wysłanego do modelu. Na twoich serwerach, na twoich modelach, bez opłat licencyjnych.
>
> **[Uruchom u siebie]** **[Zobacz demo]** **[GitHub]**
>
> Apache 2.0 · 15 języków interfejsu · bez GPU · odpowiedzi z linkiem do źródła

**EN**

> # AI that will not show an employee a document they cannot open
>
> Ragen is an open-source RAG platform for companies. Permissions are enforced at retrieval, not in the UI: a document a user cannot open never reaches the answer, the citation, or the prompt sent to the model. Your servers, your models, no licence fees.
>
> **[Run it yourself]** **[See the demo]** **[GitHub]**
>
> Apache 2.0 · 15 interface languages · no GPU required · every answer cites its source

#### Wariant B, bezpieczniejszy pod SEO: kategoria wprost

**PL**

> # Otwarta platforma RAG dla firm
>
> Twoje dokumenty stają się asystentem, który odpowiada i podaje źródło. Wszystko zostaje na twojej infrastrukturze: dokumenty, baza, indeks wektorowy i klucze szyfrujące. Modele wybierasz sam, zmiana dostawcy to plik konfiguracyjny.
>
> **[Uruchom w 5 minut]** **[Umów rozmowę o wdrożeniu]**

**EN**

> # Open-source RAG platform for companies
>
> Your documents become an assistant that answers and shows where the answer came from. Documents, database, vector index and encryption keys stay on your infrastructure. You choose the models, and changing provider is a config file.
>
> **[Get running in 5 minutes]** **[Talk to us about a rollout]**

Rekomendacja: **A na stronę główną, B jako `<title>` i H1 na `/pl/produkt` oraz w meta description.** A różnicuje, B rankuje.

### 4.3 Pasek zaufania pod hero

Zamiast "15 języków interfejsu / 24-7 dostępność / 100% twoje dane", gdzie dwa z trzech są portowalne do każdego produktu:

**PL**
> Apache 2.0 · 42 udokumentowane decyzje architektoniczne · 15 języków interfejsu · zero komponentów raportujących do dostawcy

**EN**
> Apache 2.0 · 42 documented architecture decisions · 15 interface languages · no component reports back to the vendor

Gdy repo dobije do sensownej liczby gwiazdek, ten pasek jest właściwym miejscem, żeby ją pokazać. Tak robi PrivateGPT.

### 4.4 Sekcja "Dla kogo jest Ragen"

Trzy segmenty, bez rozmywania. To jest sekcja, która ma być na stronie głównej, nie w stopce.

**PL**

> ## Dla kogo jest Ragen
>
> **Firma, która nie może wysłać swoich dokumentów w chmurę.**
> Umowy, dokumentacja techniczna, akta pracownicze. Dokumenty, baza, indeks i klucze zostają u ciebie, i mamy dokument, który możesz podać osobie robiącej przegląd bezpieczeństwa. Pisze wprost, co wychodzi z sieci przy jakiej konfiguracji, w tym dwa przypadki, w których uczciwa odpowiedź to "zależy, jak ustawisz".
>
> **Zespół, który buduje własny produkt.**
> API zgodne z OpenAI i oficjalny SDK w TypeScripcie. Większość istniejących klientów działa po zmianie adresu bazowego. Ragen jest też serwerem MCP, więc asystenta wywołasz z Claude Desktop albo Cursora tym samym kluczem.
>
> **Partner, który wdraża AI u swoich klientów.**
> Multi-tenancy jest w architekturze, nie w dodatku: jedna kolekcja wektorowa na organizację i guard w warstwie danych, który zgłasza każde zapytanie bez filtra organizacji. Jedna instancja, wielu klientów, bez opłat za stanowisko.
>
> **Dla kogo Ragen nie jest.** Jeśli szukasz asystenta, który generuje obrazy, rozmawia głosem i uruchamia kod, lepiej pasuje ChatGPT albo Onyx. Ragen odpowiada na twoich dokumentach i pilnuje, kto co widzi.

Ostatni akapit jest ważny i konkurencja go nie ma. Powiedzenie, dla kogo produkt nie jest, kupuje wiarygodność wszystkiego powyżej. To ta sama mechanika, co środkowa kolumna w tabeli porównawczej w README.

**EN**

> ## Who Ragen is for
>
> **A company that cannot put its documents in someone else's cloud.**
> Contracts, technical documentation, personnel files. Documents, database, index and keys stay with you, and there is a document you can hand a security reviewer. It says plainly what leaves your network under which configuration, including the two cases where the honest answer is "it depends how you set it up".
>
> **A team building its own product.**
> An OpenAI-compatible API and an official TypeScript SDK. Most existing clients work by changing the base URL. Ragen is also an MCP server, so you can call the assistant from Claude Desktop or Cursor with the same key.
>
> **A partner rolling AI out to their own clients.**
> Multi-tenancy is in the architecture, not bolted on: one vector collection per organization, and a guard in the data layer that flags any query missing its org filter. One installation, many clients, no per-seat fees.
>
> **Who Ragen is not for.** If you want an assistant that generates images, talks back and runs code, ChatGPT or Onyx fits better. Ragen answers from your documents and keeps track of who can see what.

### 4.5 Sekcja "Dlaczego Ragen", cztery bloki

Przepisane z README, bo README jest lepiej napisane niż strona. Każdy blok ma dowód, nie przymiotnik.

**PL**

> ## Dlaczego Ragen
>
> **Uprawnienia działają tam, gdzie mają znaczenie.**
> Każdy fragment dokumentu nosi filtr dostępu stosowany przy zapytaniu. Dokument, którego użytkownik nie może otworzyć, nie pojawi się w odpowiedzi, w cytowaniu ani w kontekście wysłanym do modelu. Większość narzędzi filtruje listę plików i przekazuje modelowi wszystko.
>
> **Wyszukiwanie, które zmierzyliśmy, a nie założyliśmy.**
> Hybrydowe wyszukiwanie gęste i BM25 z fuzją po stronie Qdranta, rozszerzanie zapytania, streszczenia dokumentów generowane przy ingest, reranking cross-encoderem. Cztery techniki, każda z zapisaną decyzją i kosztem. Zbiory testowe do jakości wyszukiwania, przeformułowań i zachowania pod atakiem są w repozytorium i możesz je uruchomić u siebie.
>
> **Twoja infrastruktura, twoje klucze.**
> Dokumenty, baza, indeks wektorowy i klucze zostają tam, gdzie je postawisz. Żaden komponent nie raportuje do nas, i nie mamy hostowanej wersji, którą wolelibyśmy ci sprzedać.
>
> **Brak lock-inu na modelu.**
> Każde wywołanie modelu idzie przez proxy LiteLLM, które też uruchamiasz sam. Scaleway, Azure OpenAI, AWS Bedrock, Google Vertex, OpenRouter albo model na twoim GPU. Zmiana dostawcy to plik konfiguracyjny, nie migracja.

**EN** (te same cztery bloki, tekst z README jest gotowy do użycia bez zmian)

### 4.6 Sekcja "Jak to wypada w porównaniu"

Tabela z README działa na stronie tak samo dobrze jak w repo, i konkurencja nie ma odpowiednika. Warto ją przenieść w całości, z uczciwą kolumną środkową. Zdanie "jeśli twoje wymagania są naprawdę niestandardowe, zbudowanie tego samemu jest sensowną odpowiedzią" robi więcej dla wiarygodności niż cała sekcja funkcji.

Do tego trzy strony porównawcze na docs.ragen.ai: Ragen vs Onyx, Ragen vs PrivateGPT, Ragen vs DocsGPT.

### 4.7 Poprawki punktowe

| Miejsce | Teraz | Propozycja |
|---|---|---|
| Lista modeli | GPT-5.2 Thinking, Gemini 3 Flash, Claude Sonnet 4.6, Perplexity Sonar Pro | "Każdy model, który obsługuje LiteLLM, w tym modele na twoim własnym GPU." Konkretne nazwy w dokumentacji, nie na stronie. |
| Compliance | "Enterprise compliance ready (GDPR, NIS2, DORA, SOC2, HIPAA)" | Napisać, co robimy: szyfrowanie na poziomie rozmowy, maskowanie PII, log audytowy ze stanem przed i po, uprawnienia per plik i folder, dane w twojej sieci. Osobno: "Dokument do przeglądu bezpieczeństwa". Bez słowa "ready". |
| SSO w cenniku | SSO w planie Enterprise | Dopóki `docs/security-and-privacy.md` mówi "not built yet", zdjąć z cennika. Wpisanie tego do roadmapy jest lepsze niż sprzedawanie tego teraz. |
| CTA na dole | "Umów 30-minutową konsultację" | Zostawić, ale nad nim postawić "Uruchom u siebie" z linkiem do quickstartu. Dwie ścieżki, tak jak u wszystkich trzech konkurentów. |
| Wynik u klienta | "One client reduced warranty claim processing from 12 hours to under 40 minutes per case" | Zostawić liczbę, dodać nazwę klienta i branżę, jeśli da się uzyskać zgodę. Bez nazwy to najsłabsza wersja najlepszego argumentu, jaki mamy. |
| Nagłówek "AI Agents" | trzy typy agentów opisane jako możliwości | Oznaczyć wprost jako roadmapę albo zdjąć. Konkurencja ma to wdrożone, więc opisywanie tego jako "emerging" czyta się jako zaległość, a nie jako plan. |

---

## 5. Co zrobić w tym tygodniu

Jeśli z całego dokumentu miałoby wejść pięć rzeczy, to te:

1. **Zdecydować, że strona i repo mówią to samo.** Nagłówek z wariantu A, dwa CTA, sekcja "dla kogo" na stronie głównej. To jest jeden dzień pracy i naprawia najdroższy problem.
2. **Uruchomić eval na obecnym stacku i opublikować wynik.** To odblokowuje główny argument premiery i spłaca dług z ADR-20.
3. **Zamknąć dwa `TODO` z README: kanał społeczności i badge'y.** Plus poprawić liczbę ADR-ów na 42.
4. **Nagrać GIF demo na prawdziwym interfejsie** i uporządkować status aspiracyjnych screenów.
5. **Napisać do Scaleway w sprawie case study.** Najlepszy stosunek efektu do pracy z całej sekcji dystrybucyjnej, i okno jest teraz, bo suwerenność danych to ich aktualna narracja.

---

### Źródła

- [ragen.ai](https://ragen.ai) · [ragen.ai/en](https://ragen.ai/en) · [ragen.ai/pl/cennik](https://ragen.ai/pl/cennik) · [docs.ragen.ai](https://docs.ragen.ai)
- [github.com/webamigos/ragenai](https://github.com/webamigos/ragenai)
- [zylon.ai/private-gpt](https://www.zylon.ai/private-gpt) · [github.com/zylon-ai/private-gpt](https://github.com/zylon-ai/private-gpt)
- [onyx.app](https://onyx.app/) · [onyx.app/pricing](https://onyx.app/pricing) · [onyx.app/connectors](https://onyx.app/connectors) · [github.com/onyx-dot-app/onyx](https://github.com/onyx-dot-app/onyx)
- [docsgpt.cloud](https://www.docsgpt.cloud/) · [docs.docsgpt.cloud](https://docs.docsgpt.cloud/) · [github.com/arc53/DocsGPT](https://github.com/arc53/DocsGPT)
- Repozytorium lokalne: `README.md`, `docs/security-and-privacy.md`, `docs/open-core-boundary.md`, `docs/rag-roadmap-status.md`, `docs/adrs/`
