import { MessageType } from '@prisma/client';

export interface VoiceModeState {
  recordingTime: number;
  transcriptText: string;
  isGeneratingAudio: boolean;
  isPlayingAudio: boolean;
  hasApiError: boolean;
  currentMessages: Array<{
    role: string;
    content: string;
    message_type?: MessageType;
    voice_played?: boolean;
    public_id?: string;
  }>;
}

export type VoiceModeAction =
  | { type: 'INCREMENT_RECORDING_TIME' }
  | { type: 'RESET_RECORDING' }
  | { type: 'SET_TRANSCRIPT_TEXT'; payload: string }
  | { type: 'SET_GENERATING_AUDIO'; payload: boolean }
  | { type: 'SET_PLAYING_AUDIO'; payload: boolean }
  | { type: 'SET_API_ERROR'; payload: boolean }
  | { type: 'UPDATE_MESSAGES'; payload: VoiceModeState['currentMessages'] }
  | { type: 'UPDATE_MESSAGE_PLAYED_STATUS'; payload: string };

export const initialState: VoiceModeState = {
  recordingTime: 0,
  transcriptText: '',
  isGeneratingAudio: false,
  isPlayingAudio: false,
  hasApiError: false,
  currentMessages: [],
};

export function voiceModeReducer(
  state: VoiceModeState,
  action: VoiceModeAction
): VoiceModeState {
  switch (action.type) {
    case 'INCREMENT_RECORDING_TIME':
      return {
        ...state,
        recordingTime: state.recordingTime + 1,
      };
    case 'RESET_RECORDING':
      return {
        ...state,
        recordingTime: 0,
        transcriptText: '',
        isGeneratingAudio: true,
      };
    case 'SET_TRANSCRIPT_TEXT':
      return {
        ...state,
        transcriptText: action.payload,
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
    case 'SET_API_ERROR':
      return {
        ...state,
        hasApiError: action.payload,
        isGeneratingAudio: false,
      };
    case 'UPDATE_MESSAGES':
      return {
        ...state,
        currentMessages: action.payload,
      };
    case 'UPDATE_MESSAGE_PLAYED_STATUS':
      return {
        ...state,
        currentMessages: state.currentMessages.map((msg) =>
          msg.public_id === action.payload
            ? { ...msg, voice_played: true }
            : msg
        ),
      };
    default:
      return state;
  }
}
