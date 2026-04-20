# Optymalizator dokumentów dla bazy wiedzy - nowa funkcja w Ragen AI

Jednym z najczęstszych wyzwań w systemach RAG (Retrieval-Augmented Generation) jest jakość dokumentów w bazie wiedzy. Nawet najlepszy model AI nie znajdzie właściwej odpowiedzi, jeśli dokumenty są źle ustrukturyzowane - zbyt długie bloki tekstu, brak konkretnych danych, sekcje, które nie mają sensu bez kontekstu całego dokumentu.

Dlatego wprowadzamy **Optymalizator dokumentów** - narzędzie, które pomaga przygotować i ocenić dokumenty pod kątem wyszukiwania AI.

## Problem: nie każdy dokument nadaje się do bazy wiedzy

Wyobraź sobie, że wgrywasz do bazy wiedzy politykę kadrową firmy lub regulamin e-commerce. Dokument ma 15 stron ciągłego tekstu, bez wyraźnych sekcji, bez konkretnych danych kontaktowych przy odpowiednich tematach. Gdy klient zapyta "ile mam dni urlopu?", system musi przeszukać cały dokument i wybrać odpowiedni fragment.

Problem w tym, że:
- Duże bloki tekstu są trudne do precyzyjnego wyszukiwania
- Brak nagłówków oznacza brak naturalnych granic dla chunków
- Odpowiedzi rozproszone po dokumencie wymagają łączenia wielu fragmentów
- Ogólne sformułowania ("skontaktuj się z HR") zamiast konkretów ("Anna Wiśniewska, anna@firma.pl, wew. 210") obniżają wartość odpowiedzi

## Rozwiązanie: automatyczna optymalizacja i ocena

### Generator dokumentów Q&A

Nowa opcja **"Optymalizuj dla RAG"** dostępna jest w menu dodawania dokumentów w bazie wiedzy. Działa to tak:

1. **Wklejasz surowy tekst** dokumentu (polityka firmy, regulamin, FAQ, instrukcja)
2. **AI przeformatowuje go** na strukturę pytanie-odpowiedź z numerowanymi sekcjami
3. **Podgląd w czasie rzeczywistym** - widzisz jak dokument jest przetwarzany
4. **Zapisujesz do bazy wiedzy** jednym kliknięciem

Co robi optymalizator:
- Dzieli treść na samodzielne sekcje Q&A (80-150 słów każda)
- Dodaje numerowane nagłówki (### 1.1, ### 1.2) tworzące naturalne granice chunków
- Zachowuje wszystkie konkretne dane: kwoty, daty, numery artykułów prawnych, dane kontaktowe
- Powtarza kluczowe informacje w każdej sekcji, żeby była zrozumiała bez kontekstu
- Wykrywa język dokumentu i odpowiada w tym samym języku

### Automatyczna ocena RAG Score

Każdy dokument wgrany do bazy wiedzy jest teraz automatycznie oceniany pod kątem gotowości do wyszukiwania AI. Wynik widoczny jest jako kolorowa etykieta przy nazwie pliku:

- **Zielona (70-100)** - dokument dobrze przygotowany do RAG
- **Pomarańczowa (40-69)** - dokument wymaga poprawy
- **Czerwona (0-39)** - dokument słabo nadaje się do wyszukiwania

Ocena bazuje na pięciu wymiarach:
- **Struktura chunków** - czy dokument ma nagłówki tworzące naturalne podziały
- **Rozmiar sekcji** - czy sekcje mają optymalną długość (80-150 słów)
- **Gęstość encji** - ile konkretnych danych (nazwy, kwoty, daty) zawiera dokument
- **Samowystarczalność** - czy każda sekcja jest zrozumiała bez czytania reszty
- **Format Q&A** - czy dokument ma strukturę pytanie-odpowiedź

## Przykład: polityka zwrotów sklepu

Wgraliśmy przykładową politykę zwrotów i reklamacji (sklep z elektroniką, 7 sekcji, ~30 pytań). Po optymalizacji dokument uzyskał ocenę **RAG: 92/100**.

Oto kilka zapytań, które pokazują siłę dobrze przygotowanego dokumentu:

- *"Pralka mi nie pasuje, odebrali mi ją, ale co z kosztami?"* - trafia w sekcję o zwrotach wielkogabarytowych AGD
- *"Sprzęt zepsuł się po półtora roku"* - znajduje niuans o ciężarze dowodu po 12 miesiącach
- *"Kupiłem iPhone, zalogowałem się, chcę zwrócić"* - identyfikuje problem Activation Lock
- *"Zwróciłem produkt z kodem rabatowym, czy kod wróci?"* - precyzyjna odpowiedź z regulaminu

Kluczowe jest to, że każda odpowiedź zawiera konkretne dane: numery artykułów prawnych, terminy, kwoty i dane kontaktowe osoby odpowiedzialnej.

## Jak zacząć

1. Wejdź do **Bazy wiedzy** w panelu Ragen
2. Kliknij **"Dodaj dokument"** i wybierz **"Optymalizuj dla RAG"**
3. Wklej treść dokumentu i kliknij **"Generuj"**
4. Sprawdź podgląd i zapisz do bazy wiedzy

Istniejące dokumenty możesz ocenić klikając menu (trzy kropki) przy pliku i wybierając **"Oceń dla RAG"**.

---

Optymalizator dokumentów jest dostępny dla wszystkich użytkowników Ragen AI. Jeśli masz pytania lub sugestie, napisz do nas na support@ragen.ai.
