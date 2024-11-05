export const SET_DOCUMENT = 'SET_DOCUMENT';
export const SET_EDITING = 'SET_EDITING';
export const SET_LOADING = 'SET_LOADING';
export const SET_EDITABLE_CONTENT = 'SET_EDITABLE_CONTENT';
export const SET_SAVING = 'SET_SAVING';
export const SET_EDITABLE_TITLE = 'SET_EDITABLE_TITLE';
export const SET_DOCUMENT_TITLE = 'SET_DOCUMENT_TITLE';
export const SET_EDITING_TITLE = 'SET_EDITING_TITLE';

export type State = {
  documentContent: string | null;
  documentTitle: string | null;
  isLoading: boolean;
  isEditing: boolean;
  editableContent: string | null;
  isEditingTitle: boolean;
  editableTitle: string | null;
  isSaving: boolean;
};

export type Action =
  | { type: typeof SET_DOCUMENT; payload: { content: string; title: string } }
  | { type: typeof SET_EDITING; payload: boolean }
  | { type: typeof SET_LOADING; payload: boolean }
  | { type: typeof SET_EDITABLE_CONTENT; payload: string }
  | { type: typeof SET_SAVING; payload: boolean }
  | { type: typeof SET_EDITABLE_TITLE; payload: string | null }
  | { type: typeof SET_DOCUMENT_TITLE; payload: string }
  | { type: typeof SET_EDITING_TITLE; payload: boolean };

export const initialState: State = {
  documentContent: null,
  documentTitle: null,
  isLoading: true,
  isEditing: false,
  editableContent: null,
  isEditingTitle: false,
  editableTitle: null,
  isSaving: false,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case SET_DOCUMENT:
      return {
        ...state,
        documentContent: action.payload.content,
        documentTitle: action.payload.title,
        isLoading: false,
      };
    case SET_EDITING:
      return { ...state, isEditing: action.payload };
    case SET_LOADING:
      return { ...state, isLoading: action.payload };
    case SET_EDITABLE_CONTENT:
      return { ...state, editableContent: action.payload };
    case SET_SAVING:
      return { ...state, isSaving: action.payload };
    case SET_EDITABLE_TITLE:
      return { ...state, editableTitle: action.payload };
    case SET_DOCUMENT_TITLE:
      return { ...state, documentTitle: action.payload };
    case SET_EDITING_TITLE:
      return { ...state, isEditingTitle: action.payload };
    default:
      return state;
  }
}
