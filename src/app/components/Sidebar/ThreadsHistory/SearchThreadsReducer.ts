type ThreadSuggestion = {
  id: string;
  title: string;
};

type State = {
  query: string;
  results: { id: string; title: string; createdAt: string }[];
  suggestions: ThreadSuggestion[];
  isLoading: boolean;
  hasSearched: boolean;
};

type Action =
  | { type: 'SET_QUERY'; payload: string }
  | {
      type: 'SET_RESULTS';
      payload: { id: string; title: string; createdAt: string }[];
    }
  | { type: 'SET_SUGGESTIONS'; payload: ThreadSuggestion[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_HAS_SEARCHED'; payload: boolean }
  | { type: 'RESET' };

export const initialState: State = {
  query: '',
  results: [],
  suggestions: [],
  isLoading: false,
  hasSearched: false,
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    case 'SET_RESULTS':
      return { ...state, results: action.payload };
    case 'SET_SUGGESTIONS':
      return { ...state, suggestions: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_HAS_SEARCHED':
      return { ...state, hasSearched: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};
