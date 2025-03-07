export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const DEFAULT_ANSWER_INSTRUCTIONS =
  'Jesteś ekspertem w interpretowaniu i odpowiadaniu na pytania.';

export const systemTemplates = {
  answerChain: `
      {answer_instructions}

      {project_instructions}

      
      Korzystając z historii czatu, odpowiedz na pytanie użytkownika najlepiej jak potrafisz, jednocześnie dokładnie przestrzegając zasad.
      
      <zasady>
      - Zawsze odpowiadaj w języku polskim.
      - Jeśli nie znasz odpowiedzi, wyraźnie powiedz, że nie wiesz.
      - Jeśli pytanie jest niejednoznaczne lub ma wiele możliwych interpretacji, poproś użytkownika o wyjaśnienie.
      - Zwracaj odpowiedzi w formacie Markdown.
      - Jeśli podano instrukcje projektu w znacznikach <project_instructions>, dostosuj swoją odpowiedź do tych instrukcji.
      </zasady>`,
} as const;

export const humanTemplates = {
  answerChain: `{question}`,
} as const;
