import { type VoiceModeState } from './types';

export const initialState: VoiceModeState = {
  currentMessages: [],
  hasApiError: false,
  isGeneratingAudio: false,
  isPlayingAudio: false,
  recordingTime: 0,
  transcriptText: '',
  localIsRecording: true,
  isWaitingForResponse: false,
  error: null,
};

type VoiceModeAction =
  | { type: 'UPDATE_MESSAGES'; payload: VoiceModeState['currentMessages'] }
  | { type: 'SET_API_ERROR'; payload: boolean }
  | { type: 'SET_GENERATING_AUDIO'; payload: boolean }
  | { type: 'SET_PLAYING_AUDIO'; payload: boolean }
  | { type: 'INCREMENT_RECORDING_TIME' }
  | { type: 'SET_TRANSCRIPT_TEXT'; payload: string }
  | { type: 'RESET_RECORDING' }
  | { type: 'UPDATE_MESSAGE_PLAYED_STATUS'; payload: string }
  | { type: 'SET_LOCAL_RECORDING'; payload: boolean }
  | { type: 'SET_WAITING_FOR_RESPONSE'; payload: boolean }
  | { type: 'SET_ERROR'; payload: Error | null };

export const voiceModeReducer = (
  state: VoiceModeState,
  action: VoiceModeAction,
): VoiceModeState => {
  switch (action.type) {
    case 'UPDATE_MESSAGES':
      return {
        ...state,
        currentMessages: action.payload,
      };
    case 'SET_API_ERROR':
      return {
        ...state,
        hasApiError: action.payload,
      };
    case 'SET_GENERATING_AUDIO':
      return {
        ...state,
        isGeneratingAudio: action.payload,
      };
    case 'SET_PLAYING_AUDIO':
      return {
        ...state,
        isPlayingAudio: action.payload,
      };
    case 'INCREMENT_RECORDING_TIME':
      return {
        ...state,
        recordingTime: state.recordingTime + 1,
      };
    case 'SET_TRANSCRIPT_TEXT':
      return {
        ...state,
        transcriptText: action.payload,
      };
    case 'RESET_RECORDING':
      return {
        ...state,
        recordingTime: 0,
        transcriptText: '',
        localIsRecording: false,
      };
    case 'UPDATE_MESSAGE_PLAYED_STATUS':
      return {
        ...state,
        currentMessages: state.currentMessages.map((message) =>
          message.id === action.payload
            ? { ...message, voicePlayed: true }
            : message,
        ),
      };
    case 'SET_LOCAL_RECORDING':
      return {
        ...state,
        localIsRecording: action.payload,
        isWaitingForResponse:
          !action.payload && state.transcriptText.trim() !== '',
      };
    case 'SET_WAITING_FOR_RESPONSE':
      return {
        ...state,
        isWaitingForResponse: action.payload,
      };
    case 'SET_ERROR':
      return {
        ...initialState,
        error: action.payload,
        currentMessages: state.currentMessages,
        localIsRecording: false,
      };
    default:
      return state;
  }
};
