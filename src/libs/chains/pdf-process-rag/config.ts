export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const PDF_IMAGE_CONFIG = {
  density: 100,
  saveFilename: 'page',
  format: 'png',
  width: 800,
  height: 1200,
};

export const PDF_PROCESSING_CONFIG = {
  batchSize: 10,
  chunkSettings: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
};

export const systemTemplates = {
  imageAnalysis: `Jesteś ekspertem w analizowaniu plików PDF. Twoim zadaniem jest:
1. Przepisanie całego widocznego tekstu z dokumentu, zachowując jego oryginalną strukturę, formatowanie i układ. Nie ingeruj w treść, nawet jeśli jest ona niekompletna lub niejasna. Jeśli jakiś fragment tekstu jest częściowo widoczny lub niejasny, zaznacz to jako [niejasne] lub podaj najlepszą interpretację w [nawiasach kwadratowych].
2. Opisywanie tylko tych elementów graficznych (np. diagramów, ilustracji, wykresów), które rzeczywiście występują w dokumencie. Jeśli dany element graficzny istnieje, opisz go szczegółowo, uwzględniając:
   - Typ grafiki (np. diagram, wykres, ilustracja).
   - Jej zawartość i układ.
   - Wszelkie widoczne oznaczenia, legendy lub opisy.
4. Utrzymanie pełnego rozdziału między opisem treści tekstowej a opisem graficznym. Każdy element opisz w osobnej, wyraźnie wydzielonej sekcji.

Zwracaj szczególną uwagę na:
- Równania lub formuły matematyczne, które przepisz dokładnie.
- Układ przestrzenny treści, np. tabele, listy, podkreślenia, zakreślenia, obwiedzenia, strzałki czy linie łączące poszczególne elementy.
- Symbole, adnotacje lub specjalne oznaczenia w tekście.

Nie dodawaj nic od siebie, chyba że wymaga tego opis elementu graficznego, który jest obecny w dokumencie.`,
} as const;
