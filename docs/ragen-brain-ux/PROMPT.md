# Prompt do Claude Code

Skopiuj całość poniżej do Claude Code uruchomionego w repozytorium Ragen. Wcześniej wrzuć do repo folder `ragen-brain-ux/` (SPEC.md i mockups/), np. do `docs/brain-ux/`.

---

Pracujesz nad modułem Brain w Ragen (RAG dla firm, UI po polsku, trasy `/pl/brain/*`). Chcę przeprowadzić ewolucję UX, nie rewolucję: ujednolicić język i uprościć poruszanie się, bez zmiany struktury zakładek, tras, API ani modelu danych.

Materiały są w `docs/brain-ux/`:
- `SPEC.md`: pełna lista zmian, słownik, kryteria akceptacji i sekcja "do decyzji",
- `mockups/*.html`: makiety docelowych ekranów (Przegląd, Tryb przeglądu, Strona wiedzy). Nie renderują się samodzielnie, czytaj je jako źródło tekstów i układu. Żółte plakietki to adnotacje, nie UI.

Najpierw zbadaj kod, nic jeszcze nie zmieniaj:
1. Znajdź komponenty i trasy modułu Brain (Przegląd, Strony wiedzy, szczegóły strony, Tryb przeglądu, Wykrycia, Graf, Dokumenty) oraz pliki tłumaczeń (PL i pozostałe języki).
2. Znajdź, jak liczone są "zatwierdzone czekają na publikację" (Przegląd) oraz "Gotowe do eksportu" i "Opublikuj zatwierdzone (n)" (lista stron). Na demo pierwsze pokazuje 2, a drugie 3. Powiedz, skąd różnica.
3. Sprawdź, czy etykiety statusów w UI są oddzielone od enumów (CANDIDATE, APPROVED itd.). Zmieniamy tylko etykiety, nigdy wartości w API, bazie ani parametrach URL.

Potem przedstaw krótki plan i poczekaj na moje potwierdzenie. Plan ma mieć fazy:

Faza 1, tylko teksty (i18n): słownik z sekcji 1 SPEC.md, we wszystkich językach, bez zmian w układzie. Dodaj słownik tłumaczeń predykatów relacji ("manufactures" → "produkuje" itd.).

Faza 2, małe zmiany UI z sekcji 2 SPEC.md: okruszki zamiast linków powrotu, jeden wzorzec początku ekranu, jeden przycisk "Dodaj dokumenty" w nagłówku, pas "Co teraz?" na Przeglądzie, spójne liczby, podpisy przy ✓ i ✕, powód wyszarzenia przy przycisku, usunięcie duplikatu cytatów na stronie wiedzy, legenda w Grafie, uporządkowanie tabeli Źródeł. Każdy podpunkt jako osobny, mały commit.

Faza 3 nie jest do zrobienia teraz: pozycje z sekcji 3 SPEC.md to decyzje produktowe. Nie implementuj ich, tylko dla każdej wypisz krótko opcje i koszt.

Zasady:
- Trzymaj się istniejącego design systemu i komponentów w repo. Makiety pokazują cel, ale kolory, fonty i komponenty bierz z kodu, nie z HTML makiet.
- Identyfikatory w kodzie po angielsku. Teksty UI po polsku, naturalnym językiem, bez myślników długich (—). Używaj przecinków, dwukropków lub półpauzy (–).
- Dostępność: `aria-label` na przyciskach z ikonami, cele dotykowe min. 44 px, kontrast min. 4.5:1, skróty A/R/J/K w Trybie przeglądu mają działać jak dotąd.
- Nie ruszaj logiki biznesowej poza punktem 2.3 (spójność liczb), i tam najpierw pokaż mi wynik analizy.
- Uruchom testy i lint po każdej fazie. Jeśli zmiana łamie snapshoty, napisz dlaczego, zanim je zaktualizujesz.
- Na koniec każdej fazy podsumuj: co zmienione, które pliki, co świadomie pominięte.

Zacznij od kroków 1 do 3 i pokaż plan.
