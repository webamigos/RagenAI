export const SET_DOCUMENT = 'SET_DOCUMENT';
export const SET_EDITING = 'SET_EDITING';
export const SET_LOADING = 'SET_LOADING';
export const SET_EDITABLE_CONTENT = 'SET_EDITABLE_CONTENT';
export const SET_SAVING = 'SET_SAVING';
export const SET_DOCUMENT_TITLE = 'SET_DOCUMENT_TITLE';
export const EDIT_TITLE_MODE = 'EDIT_TITLE_MODE';

export type State = {
  isLoading: boolean;
  isEditing: boolean;
  isEditingTitle: boolean;
  isSaving: boolean;
  documentContent: string;
  documentTitle: string;
};

export type Action =
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_IS_EDITING'; payload: boolean }
  | { type: 'SET_IS_EDITING_TITLE'; payload: boolean }
  | { type: 'SET_IS_SAVING'; payload: boolean }
  | { type: 'SET_DOCUMENT_CONTENT'; payload: string }
  | { type: 'SET_DOCUMENT_TITLE'; payload: string };

export const initialState: State = {
  isLoading: true,
  isEditing: false,
  isEditingTitle: false,
  isSaving: false,
  documentContent: '',
  documentTitle: '',
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_IS_EDITING':
      return { ...state, isEditing: action.payload };
    case 'SET_IS_EDITING_TITLE':
      return { ...state, isEditingTitle: action.payload };
    case 'SET_IS_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_DOCUMENT_CONTENT':
      return { ...state, documentContent: action.payload };
    case 'SET_DOCUMENT_TITLE':
      return { ...state, documentTitle: action.payload };
    default:
      return state;
  }
}
