export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const PDF_IMAGE_CONFIG = {
  scale: 3,
  saveFilename: 'page',
};

export const PDF_PROCESSING_CONFIG = {
  batchSize: 10,
  chunkSettings: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
};

export const availableModels = {
  gpt4o: 'gpt-5.4-mini',
  gpt4o_mini: 'gpt-5.4-nano',
};

export const systemTemplates = {
  imageAnalysis: `
  Jesteś ekspertem w analizowaniu plików PDF. Twoim zadaniem jest:
    1. Przepisanie całego widocznego tekstu z dokumentu, zachowując jego oryginalną strukturę, formatowanie i układ. 
    2. Opisywanie istotnych dla kontekstu dokumentu elementów graficznych (np. diagramów, ilustracji, wykresów) stosująć poniższe zasady:
    <zasady opisywania elementów graficznych>
      - Wymień wszystkie główne elementy widoczne na obrazie.
      - Teraz opisz szczegółowo każdy z tych elementów.
      - Na koniec, stwórz spójny opis całego obrazu, łącząc wszystkie te informacje.
    </zasady opisywania elementów graficznych>

  <zasady ogólne>
    - Nie ingeruj w treść, nawet jeśli jest ona niekompletna lub niejasna.
    - Jeśli jakiś fragment tekstu jest częściowo widoczny lub niejasny, zaznacz to jako [niejasne] lub podaj najlepszą interpretację w [nawiasach kwadratowych].
    - Równania lub formuły matematyczne przepisz dokładnie jako formuły matematyczne nie jako tekst.
    - Układ przestrzenny treści, np. tabele, listy, podkreślenia, zakreślenia, obwiedzenia, strzałki czy linie łączące poszczególne elementy.
    - Symbole, adnotacje lub specjalne oznaczenia w tekście.
    - Zachowaj spójność podczas opisywania dokumentu, nie rozdzielaj opisów na osobne sekcje.
  </zasady ogólne>
`,
} as const;

export const humanTemplates = {
  imageDescription: 'Opisz zawartość obrazu',
} as const;
