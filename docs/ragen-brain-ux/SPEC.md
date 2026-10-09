# Ragen Brain: poprawki spójności i UX (specyfikacja)

Cel: ewolucja istniejącego modułu Brain, nie przebudowa. Upraszczamy język i nawigację, żeby user szybciej rozumiał, co ma zrobić. Struktura zakładek, trasy i model danych zostają.

Przejrzane (demo.ragen.ai, język PL, rola Właściciel): `/pl/brain/overview`, `/pl/brain` (Strony wiedzy), `/pl/brain/pages/<id>`, `/pl/brain/review`, `/pl/brain/findings`, `/pl/brain/graph`, `/pl/brain/documents`.

Pliki w `mockups/` to makiety docelowego wyglądu trzech ekranów (format .dc.html, nie renderują się samodzielnie). Traktuj je jako referencję tekstów i układu. Żółte plakietki w makietach to adnotacje "co się zmieniło", nie część UI.

## 1. Słownik (jedno słowo na jedno pojęcie)

Zmiana dotyczy kluczy i18n dla PL. Sprawdź też EN i inne języki, żeby nie zostawić niespójności (w EN odpowiedniki: To review / Approved / Published, Problems, Object, Sources).

| Pojęcie | Dziś (PL) | Docelowo (PL) |
|---|---|---|
| Status strony | Kandydat, Kandydaci (czekają), Same kandydatury | Do sprawdzenia → Zatwierdzona → Opublikowana |
| Publikowanie (stan) | Opublikowane w czacie | Opublikowane (w kroku lejka), Opublikowana (status strony) |
| Publikowanie (akcja) | Opublikuj w bazie wiedzy, Opublikuj zatwierdzone | Opublikuj, Opublikuj zatwierdzone (n) |
| Eksport | Gotowe do eksportu: n | Zatwierdzone: n; osobny link Pobierz .zip |
| Typ strony | Byt | Obiekt (pozostałe: Zasada, Proces) |
| Zakładka Wykrycia | Wykrycia, Otwarte wykrycia | Problemy, Otwarte problemy |
| Zakładka Dokumenty | Dokumenty | Źródła (z linkiem do Bazy wiedzy) |
| Brak właściciela | Brak właściciela / Bez właściciela | Bez właściciela wszędzie |
| Nazwa modułu | Ragen Brain (nagłówek) i Brain (menu) | Brain wszędzie |
| Weryfikacja | Zatwierdzona + "Nigdy nie zweryfikowana" | Jedna linia: "Zatwierdzona przez {osoba}, {data}" |
| Relacje | manufactures → | produkuje → (słownik tłumaczeń predykatów) |

Uwaga: nie zmieniaj wartości enumów w API ani w bazie (CANDIDATE, APPROVED itd.), tylko etykiety w UI. Parametry URL (`?status=CANDIDATE`) zostają bez zmian.

## 2. Zmiany w UI (małe)

### 2.1 Wspólny szkielet ekranów Brain
- Okruszki zamiast trzech różnych linków powrotu (`← Brain`, `← Ragen Brain`, `← Strony wiedzy`): `Brain / Strony wiedzy / Acme Industries`.
- Opis zakładki (zdanie pod zakładkami) pokazywać tylko na ekranach list/przeglądów danej zakładki. Na stronie wiedzy i w Trybie przeglądu go nie pokazywać (dziś opis listy stron wisi tam, gdzie nie pasuje).
- Jeden wzorzec początku ekranu: tytuł ekranu (h1 w tym samym stylu), jedno zdanie opisu, akcje po prawej. Dziś Graf i Dokumenty mają duży h1, Przegląd i Strony wiedzy nie.
- Nagłówek: zostaje jeden przycisk główny "Dodaj dokumenty" (łączy upload z wyodrębnianiem) i "Asystent". "Wyodrębnij ponownie" przenieść do zakładki Źródła (akcja przy dokumencie lub w menu).
- Usunąć drugi opis w Przeglądzie (dziś dwa zdania opisu jedno pod drugim).

### 2.2 Przegląd (`/pl/brain/overview`) → `mockups/Przeglad.dc.html`
- Dodać pas "Co teraz?" z jedną czynnością zależną od stanu. Kolejność reguł:
  1. są strony do sprawdzenia bez właściciela → "Przypisz właścicieli do N stron" (przycisk prowadzi do `/pl/brain?status=CANDIDATE&owner=none`, ten link już istnieje w ekranie),
  2. są strony do sprawdzenia z właścicielem → "Sprawdź N stron" (Tryb przeglądu),
  3. są zatwierdzone, a nieopublikowane → "Opublikuj N zatwierdzonych",
  4. w przeciwnym razie pas się nie pokazuje.
- Przycisk "Rozpocznij przegląd (N)" z nagłówka tej sekcji zastąpić tym pasem. Nie wolno prowadzić do trybu przeglądu, gdy nic nie da się tam zatwierdzić.
- Kroki lejka jako w całości klikalne kafle (dziś klikalny jest tylko dopisek).
- Zamiast "2% kandydatów i zatwierdzonych stron" napisać "3 z 126 stron".
- Dodać legendę koloru przy wykresie "Gdzie leży najwięcej niesprawdzonej wiedzy" i link "Wszystkie źródła".

### 2.3 Spójność liczb (do sprawdzenia w kodzie, nie zgadywać)
Dziś Przegląd mówi "2 zatwierdzone czekają na publikację", a lista stron pokazuje "Gotowe do eksportu: 3" i przycisk "Opublikuj zatwierdzone (3)". Prawdopodobnie 3 zatwierdzone, w tym 1 już opublikowana. Ustal, co liczy każde z miejsc, i ujednolić: przycisk publikacji i licznik "czekają na publikację" powinny liczyć to samo: strony, które zbiorcza publikacja faktycznie opublikuje lub opublikuje ponownie (zatwierdzone i nigdy nieopublikowane, opublikowane ze zmienioną treścią oraz z niedokończonym zapisem do indeksu; bez wycofanych i bez tych, które publikacja odrzuci). "Zatwierdzone" i "Opublikowane" to osobne liczby.

### 2.4 Tryb przeglądu (`/pl/brain/review`) → `mockups/Tryb-przegladu.dc.html`
- Przyciski ✓ i ✕ dostają podpisy: "Zgadza się" i "Do poprawy" (z `aria-label`, zachować skróty klawiaturowe).
- Powód wyszarzenia "Zatwierdź i opublikuj" wyświetlić tuż pod przyciskiem (dziś jest pod wszystkimi trzema przyciskami).
- Informację "Oceny twierdzeń są tylko w tym widoku i nie są zapisywane" pokazać jako baner nad tabelą twierdzeń.
- Okruszki zamiast linku "← Ragen Brain"; zakładka "Strony wiedzy" pozostaje aktywna.
- Nie dublować "0 z 2 potwierdzonych" (jest w treści i w kroku 2). Zostawić w kroku 2.
- Pole wyboru kolejki "Wg dokumentu źró…" ma być czytelne (dziś obcięty tekst).
- DO DECYZJI (nie robić bez potwierdzenia, patrz sekcja 3): kolejka tylko ze stronami z właścicielem.

### 2.5 Strona wiedzy (`/pl/brain/pages/<id>`) → `mockups/Strona-wiedzy.dc.html`
- Usunąć duplikat: te same cytaty są dziś w ramce pod treścią (1., 2., 3.) i jeszcze raz w sekcji "Źródła". Zostawić sekcję Źródła, a numery [1] [2] [3] w treści linkują kotwicami do wpisów.
- Prawy panel w kolejności działań: Stan (jedna linia), akcja Opublikuj, Właściciel, Dostępna dla, Powiązania, Historia.
- Zamiast osobnych "Zatwierdzona" i "Weryfikacja: Nigdy nie zweryfikowana" jedna linia stanu z osobą i datą (dane są już w Historii).
- Etykiety relacji po polsku (słownik predykatów z sekcji 1).

### 2.6 Wykrycia → Problemy (`/pl/brain/findings`)
- Filtr rodzajów z licznikami zerowymi zamienić na chipy jak w Strony wiedzy (ukrywać zera lub wyszarzać).
- Zamiast gołej etykiety "Niska" kolorowa kropka z tooltipem.
- W propozycjach powiązań dodać "Zaznacz wszystkie", przycisk głównego działania nazwać "Powiąż zaznaczone (n)". "To w porządku, zamknij" i "Zapytaj asystenta o to" jako drugorzędne.

### 2.7 Graf (`/pl/brain/graph`)
- Legenda koloru kafli tematów: bursztyn = same do sprawdzenia, zielony = jest zatwierdzona. Dziś kolory nie są objaśnione.
- Usunąć drugi nagłówek "Jak łączy się wiedza" (zakładka już tak się opisuje) i link "← Brain" (zastępują go okruszki).
- Kafle tematów niższe, a w wolne miejsce liczba zatwierdzonych.
- Etykiety w mapie sąsiedztwa nachodzą na siebie (np. "Zamówienia" i "Kary umowne"). Ograniczyć do 1 poziomu i skracać długie nazwy.

### 2.8 Dokumenty → Źródła (`/pl/brain/documents`)
- Dwa kafle z zerem ("Nic nie wyodrębniono", "Wyłączone z wyszukiwania") zamienić w pasek ostrzeżeń widoczny tylko, gdy wartość większa od zera.
- Kolumna "Akcje" jest prawie pusta: akcje do menu "⋯" w wierszu.
- Dwa wiersze statusu ("Wyodrębniono" i "W wyszukiwaniu") w jedną odznakę.
- Wyrównać styl nagłówków tabeli ze stylem tabeli na liście stron (dziś małe kapitaliki).
- Dodać link "Zarządzaj plikami w Bazie wiedzy", bo to dwie osobne listy plików pod podobną nazwą.

## 3. Wymaga decyzji produktowej (nie implementować bez potwierdzenia)

1. Hurtowe przypisanie właściciela przed przeglądem i filtrowanie kolejki do stron z właścicielem. W Trybie przeglądu jest już pole "Ustaw dla wszystkich N kandydatów z tego dokumentu", warto to wykorzystać.
2. Zapisywanie ocen ✓ i ✕ twierdzeń (dziś są tylko w widoku). Do wyboru: zapisywać albo zostawić baner z sekcji 2.4.
3. Połączenie lub wyraźne rozdzielenie Źródeł (Brain) i Bazy wiedzy (menu boczne).
4. Czy "Opublikuj" ma być jedną akcją zatwierdzającą i publikującą, czy zostają dwie ("Zatwierdź i opublikuj", "Tylko zatwierdź").

## 4. Kryteria akceptacji

- W całym UI (PL) nie występują już: "Kandydat/Kandydaci/kandydatury", "Byt", "Wykrycia/wykrycie", "Opublikowane w czacie" jako nazwa akcji, "Brak właściciela", "Ragen Brain" jako tytuł modułu.
- Ten sam licznik "zatwierdzone czekają na publikację" ma tę samą wartość na Przeglądzie i w pasku akcji listy stron.
- Główny CTA na Przeglądzie nigdy nie prowadzi do ekranu, na którym nie da się wykonać akcji.
- Na stronie wiedzy żaden cytat nie występuje dwa razy.
- Wszystkie nowe przyciski i ikony mają dostępne nazwy (`aria-label`), cele dotykowe co najmniej 44 px, kontrast tekstu co najmniej 4.5:1.
- Klawisze skrótów w Trybie przeglądu (A, R, J, K) działają jak dotąd.
- Testy i lint przechodzą. Dodane lub zmienione klucze i18n mają wartości we wszystkich obsługiwanych językach.
