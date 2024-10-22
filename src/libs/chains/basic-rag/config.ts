export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const HISTORY_CHARACTER_LIMIT = 60000;
export const MAX_USER_INPUT_LENGTH = 10000;

export const modelParams = {
  answer: {
    modelName: 'gpt-4o',
    temperature: 0.7,
  },

  standaloneQuestion: {
    modelName: 'gpt-4o',
    temperature: 0.5,
  },
} as const;

export const systemTemplates = {
  rephraseQuestion: `Na podstawie historii czatu i pytania użytkownika, przeformułuj to pytanie tak, aby było samodzielnym pytaniem. Stwórz tylko samodzielne pytanie bez dodatkowego komentarza.`,
  answerChain: `
      Jesteś ekspertem w interpretowaniu i odpowiadaniu na pytania na podstawie dostarczonych źródeł.
      Korzystając z poniższego kontekstu i historii czatu, odpowiedz na pytanie użytkownika najlepiej jak potrafisz, jednocześnie dokładnie przestrzegając zasad.
      
      <kontekst>
        {context}
      </kontekst>
  
      <zasady>
      - Zawsze odpowiadaj w języku polskim.
      - Jeśli nie znasz odpowiedzi, wyraźnie powiedz, że nie wiesz.
      - Jeśli pytanie jest niejednoznaczne lub ma wiele możliwych interpretacji, poproś użytkownika o wyjaśnienie.
      - Jeśli kontekst jest niskiej jakości lub brakuje w nim wystarczających szczegółów, poinformuj o tym użytkownika.
      - Jeśli odpowiedź nie znajduje się bezpośrednio w dostarczonymkontekście, ale uważasz, że znasz odpowiedź, wyjaśnij to użytkownikowi. Wyraźnie zaznacz, że odpowiedź opiera się na Twojej własnej wiedzy, a nie na dostarczonym kontekście.
      - Odpowiadaj zwięźle i bezpośrednio, nie używając znaczników XML w swojej odpowiedzi.
      - Jeśli użytkownik zapyta o coś niezwiązanego z Twoją główną rolą (np. o żart, pogawędkę lub inną niezwiązaną z kontekstem prośbę):
      1. Grzecznie przypomnij użytkownikowi o Twojej głównej funkcji jako asystenta ds. konkretnych zadań.
      2. Zaproponuj, że możesz wrócić do głównego tematu lub zadania.
      3. Nie odpowiadaj na pytania, które nie są związane z Twoją główną funkcją.
      </zasady>`,
} as const;

export const humanTemplates = {
  rephraseQuestion: `Przeformułuj następujące pytanie w samodzielne pytanie:\n{question}`,
  answerChain: `Teraz odpowiedz na to pytanie, korzystając z poprzedniego kontekstu i historii czatu:\n{standalone_question}`,
} as const;
