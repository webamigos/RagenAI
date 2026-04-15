# Lista wpisów do KRS dla organizacji | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Lista wpisów do KRS dla organizacji

Pobieranie listy informacji o wpisach do KRS dla danej organizacji.

GET https://rejestr.io/api/v2/org/{id}/krs-wpisy

## Obsługiwane parametry GET

`id`

string ^(\[0-9\]{1,10})|(nip\[0-9\]{10})$

Id organizacji: albo numer KRS (np. `12345` lub `0000012345`), albo NIP organizacji poprzedzony słowem "nip" (np. `nip1234567890`).

## Odpowiedź

Poprawna odpowiedź jest tablicą obiektów o następujących kluczach:

`numer`

integer

Numer porządkowy wpisu. Każda organizacja ma wpisy numerowane w sekwencji 1, 2, 3, ..

`sygnatura`

string

Sygnatura wpisu.

`data`

string

Data kiedy dokonano wpisu, w formacie RRRR-MM-DD.

`data_obowiazywania_ostatnia`

string

Ostatnia data w której obowiązywał stan z wpisu, w formacie RRRR-MM-DD. Zazwyczaj jest to data poprzedzająca datę następnego wpisu. Np. jeśli kolejny wpis ma datę "2000-01-23", to ten wpis będzie miał `data_obowiazywania_ostatnia` jako "2000-01-22". Jeśli wpis jest wciąż aktualny, to pole ma wartość `null`.

`sad`

string

Sąd gdzie dokonano wpisu.
