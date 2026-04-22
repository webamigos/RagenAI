# PII Masking (NIP, PESEL, REGON) — Design Spec

**Ticket:** [86b9hwvdj](https://app.clickup.com/t/86b9hwvdj)  
**Data:** 2026-04-22  
**Status:** Zaakceptowany

---

## Problem

Ragen przetwarza dokumenty klientów zawierające polskie dane wrażliwe (NIP, PESEL, REGON, dowód osobisty, IBAN, email, nazwisko, telefon). Dane te są embedowane i przechowywane w Qdrant — co jest bezpieczne, bo Qdrant to nasza wewnętrzna baza danych. Problem polega na tym, że RAG pobiera te chunki i wysyła je do zewnętrznego modelu LLM, co narusza wymogi RODO i differentiator "EU data residency".

Wymaganie: żadne dane wrażliwe nie mogą wypłynąć do modelu LLM.

---

## Decyzje projektowe

- **Qdrant pozostaje z oryginalnym PII** — embeddingi i chunki w cleartext. Qdrant to nasza bezpieczna baza (per-org kolekcje, `accessible_by` filter, API key wymagany na produkcji).
- **Maskowanie po stronie Ragen, nie LiteLLM** — Ragen wywołuje Presidio bezpośrednio przed wysłaniem do LiteLLM. LiteLLM pozostaje czystym proxy bez guardrails.
- **Fail-closed** — jeśli Presidio lub Redis są niedostępne, request jest blokowany (503). Żaden prompt nie trafia do modelu bez przejścia przez maskowanie.
- **Un-masking po stronie Ragen** — mapa aliasów trzymana w Redis per-thread, podmieniana w SSE stream przed pokazaniem użytkownikowi.

---

## Architektura

```
User prompt
    │
    ▼
assistant-stream.ts
    │
    ├─ 1. presidio-client.ts → Presidio Analyzer HTTP (port 5002)
    │      zamaskowany prompt + mapa aliasów { "<NIP_1>": "1234567890", ... }
    │
    ├─ 2. pii-session-store.ts → Redis SET pii:<threadId> (TTL = session + 5 min)
    │      [BLOKUJ jeśli Redis niedostępny i aliasMap niepusta]
    │
    ├─ 3. LiteLLM proxy → Model (widzi tylko pseudonimy)
    │
    ├─ 4. SSE stream chunks
    │       │
    │       └─ 5. stream-unmasker.ts → Redis GET pii:<threadId>
    │              podmienia <NIP_1> → 1234567890 w locie (buforuje tail chunka)
    │
    └─ 6. Użytkownik widzi odpowiedź z oryginalnymi danymi
```

---

## Nowe komponenty

### `src/libs/pii/presidio-client.ts`
HTTP klient do Presidio Analyzer API. Odpowiada za:
- wysłanie tekstu do analizy (`POST /analyze`)
- wywołanie anonimizacji (`POST /anonymize`)
- zwrócenie `{ maskedText: string, aliasMap: Record<string, string> }`
- throw jeśli Presidio niedostępny (fail-closed)

### `src/libs/pii/pii-session-store.ts`
Zapis i odczyt mapy aliasów z Redis.
- `save(threadId, aliasMap, ttlSeconds)` — Redis SET `pii:<threadId>`
- `get(threadId)` — Redis GET, zwraca mapę lub `{}`
- `del(threadId)` — czyszczenie po zakończeniu sesji
- throw jeśli Redis niedostępny i operacja krytyczna

### `src/libs/pii/stream-unmasker.ts`
Un-masking SSE stream w locie.
- Buforuje tail chunka — pseudonim `<NIP_1>` może być rozbity na kilka chunks
- Dla każdego kompletnego tokenu robi lookup w aliasMap
- Jeśli aliasMap pusta — przepuszcza chunks bez zmian

### `presidio/Dockerfile.analyzer`
Custom obraz Presidio Analyzer z doinstalowanym modelem spaCy `pl_core_news_md` dla polskiego NER (PERSON, LOCATION, ORGANIZATION).

### `presidio/recognizers/pl_recognizers.json`
Custom PatternRecognizer dla polskich encji z walidacją checksum:

| Entity | Regex | Checksum | Min score |
|---|---|---|---|
| `PL_NIP` | `\b\d{10}\b` lub z kreskami | wagi `[6,5,7,2,3,4,5,6,7]`, sum mod 11 | 0.85 |
| `PL_PESEL` | `\b\d{11}\b` | wagi `[1,3,7,9,1,3,7,9,1,3]` + walidacja daty urodzenia | 0.90 |
| `PL_REGON` | `\b\d{9}\b` lub `\b\d{14}\b` | osobne wagi dla 9 i 14 cyfr | 0.85 |
| `PL_ID_CARD` | `\b[A-Z]{3}\d{6}\b` | suma kontrolna poz. 3 | 0.80 |
| `PL_IBAN` | `\bPL\d{2}(\s?\d{4}){6}\b` | MOD-97 | 0.95 |
| `PL_PHONE` | `(\+48\s?)?(\d{3}[\s-]?){3}` | brak — score 0.5 + context words | 0.50 |

Context words podnoszące confidence: `["nip", "pesel", "regon", "dowód", "konto", "iban", "telefon", "tel", "nazwisko", "imię", "adres"]`

Encje out-of-the-box Presidio (język PL): `PERSON`, `EMAIL_ADDRESS`, `CREDIT_CARD`.

---

## Zmiany w istniejących plikach

### `docker-compose.yml`
Dwa nowe serwisy:

```yaml
presidio-analyzer:
  build:
    context: ./presidio
    dockerfile: Dockerfile.analyzer
  container_name: ragen-presidio-analyzer
  ports:
    - "${PRESIDIO_ANALYZER_PORT:-5002}:5002"
  environment:
    PRESIDIO_ANALYZER_RECOGNIZERS_PATH: /app/recognizers
  volumes:
    - ./presidio/recognizers:/app/recognizers
  networks:
    - ragen-network

presidio-anonymizer:
  image: mcr.microsoft.com/presidio-anonymizer:latest
  container_name: ragen-presidio-anonymizer
  ports:
    - "${PRESIDIO_ANONYMIZER_PORT:-5003}:5003"
  networks:
    - ragen-network
```

Port 5001 zajęty przez Docling → anonymizer dostaje 5003.

### `assistant-stream.ts`
Dwa nowe wywołania:
1. Przed wysłaniem do LiteLLM: `presidioClient.anonymize(prompt)` + `piiSessionStore.save(threadId, aliasMap)`
2. W SSE stream: `streamUnmasker.process(chunk)` z mapą z Redis

### `.env.local` (i `.env.example`)
```
PRESIDIO_ANALYZER_URL=http://localhost:5002
PRESIDIO_ANONYMIZER_URL=http://localhost:5003
```

### System prompt
Do każdego requestu doklejana instrukcja:
```
Jeśli widzisz tokeny w formacie <ENTITY_N> (np. <NIP_1>, <PESEL_1>, <EMAIL_1>),
używaj ich dosłownie w odpowiedzi — nie parafrazuj, nie opisuj, nie pomijaj.
```

---

## Bezpieczeństwo i fail-closed

| Scenariusz | Zachowanie |
|---|---|
| Presidio niedostępny | Blokuj request, zwróć 503, zaloguj alert |
| Redis niedostępny (aliasMap niepusta) | Blokuj request, zwróć 503, zaloguj alert |
| Redis niedostępny (aliasMap pusta, brak PII) | Przepuść — brak danych do ochrony |
| aliasMap pusta (brak PII w prompcie) | Przepuść normalnie, bez zapisu do Redis |
| Un-masking stream fail | Zwróć pseudonimy (bezpieczne) + zaloguj alert |

Zasada: **jeśli cokolwiek w pipeline maskowania zawiedzie → blokuj, nie przepuszczaj.**

---

## Observability

**Langfuse** (per trace, nigdy oryginalne wartości):
```typescript
metadata: {
  pii_entities_detected: ['PL_NIP', 'EMAIL_ADDRESS'], // typy, nie wartości
  pii_count: 3,
  masking_duration_ms: 42,
}
```

**Prometheus metrics:**
```
ragen_pii_masked_total{entity_type="PL_NIP"}
ragen_pii_masked_total{entity_type="PL_PESEL"}
ragen_pii_requests_blocked_total{reason="presidio_unavailable"}
ragen_pii_requests_blocked_total{reason="redis_unavailable"}
```

---

## Testy

| Warstwa | Co testujemy |
|---|---|
| Unit — `presidio-client.ts` | mock HTTP, poprawny format request/response, throw na 503 |
| Unit — `pii-session-store.ts` | save/get/TTL, throw gdy Redis niedostępny i aliasMap niepusta |
| Unit — `stream-unmasker.ts` | pseudonimy rozbite na chunki, brak aliasów w mapie |
| Unit — `pl-recognizers.json` | 100 syntetycznych NIP/PESEL/REGON: >95% recall, <2% FP |
| Integration — `assistant-stream.ts` | Presidio mock → stream z pseudonimami → un-mask w output |
| E2E — Playwright | prompt z NIP → odpowiedź zawiera oryginalny NIP, nie pseudonim |

---

## Spike (przed implementacją)

1 dzień standalone Python: walidacja checksum NIP/PESEL/REGON na zestawie 100 syntetycznych + 20 real-world anonimizowanych próbek. Target: >95% recall, <2% FP. Dopiero po potwierdzeniu wchodzimy w integrację.

---

## Co pozostaje poza zakresem tego ticketu

- Maskowanie PII przy ingestion do Qdrant (osobne zadanie)
- Deployment Presidio na Railway (produkcja) — po MVP lokalnym
- Per-tenant konfiguracja entity list
- Bielik + HerBERT jako alternatywny NER backend
