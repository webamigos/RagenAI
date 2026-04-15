# Odpis z KRS organizacji | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Odpis z KRS organizacji

Zwraca plik PDF z aktualnym lub pełnym odpisem KRS organizacji o danym id (numerze KRS lub NIP).

GET https://rejestr.io/api/v2/org/{id}/krs-odpisy

**Uwagi:**

- **Wymagany plan:** Odpis aktualny wymaga planu abonamentowego [Rejestr.io Premium](/cennik) lub wyższego, a odpis pełny planu [Rejestr.io Biznes](/cennik).
- **Aktualność odpisu:** Plik odpisu pochodzi z jednego z ostatnich 30 dni kalendarzowych. Zatem, jeśli wpis organizacji w KRS był aktualizowany bardzo niedawno, pobrany odpis może jeszcze nie uwzględniać tej aktualizacji.
- **Format odpowiedzi (PDF/JSON):** To zapytanie API może zwrócić odpowiedź w formacie PDF (plik odpisu) lub JSON (jeśli wystąpi błąd).
- **Organizacje wykreślone:** Takie organizacje nie posiadają odpisu aktualnego, zatem w przypadku zapytania o niego API zwróci błąd 404 (Not Found). Można natomiast pobierać dla nich odpisy pełne.

## Obsługiwane parametry GET

`id`

string ^(\[0-9\]{1,10})|(nip\[0-9\]{10})$

Id organizacji: albo numer KRS (np. `12345` lub `0000012345`), albo NIP organizacji poprzedzony słowem "nip" (np. `nip1234567890`).

`typ`

string

wartości: `aktualny`, `pelny`

domyślnie: `aktualny`

Typ pobieranego odpisu: `aktualny` lub `pelny`.

## Odpowiedź

Poprawna odpowiedź jest plikiem PDF zawierającym aktualny lub pełny odpis z KRS organizacji.
