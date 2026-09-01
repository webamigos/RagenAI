import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface VoiceState {
  isRecording: boolean;
  recordingTime: number;
  transcriptText: string;
  isGeneratingAudio: boolean;
  isPlayingAudio: boolean;
  voiceId: string;
  hasApiError: boolean;
  isWaitingForResponse: boolean;
}

const initialState: VoiceState = {
  isRecording: false,
  recordingTime: 0,
  transcriptText: '',
  isGeneratingAudio: false,
  isPlayingAudio: false,
  voiceId: '',
  hasApiError: false,
  isWaitingForResponse: false,
};

export const voiceSlice = createSlice({
  name: 'voice',
  initialState,
  reducers: {
    setRecording: (state, action: PayloadAction<boolean>) => {
      state.isRecording = action.payload;
      if (!action.payload && state.transcriptText.trim() !== '') {
        state.isWaitingForResponse = true;
      }
    },
    incrementRecordingTime: (state) => {
      state.recordingTime += 1;
    },
    setTranscriptText: (state, action: PayloadAction<string>) => {
      state.transcriptText = action.payload;
    },
    setGeneratingAudio: (state, action: PayloadAction<boolean>) => {
      state.isGeneratingAudio = action.payload;
    },
    setPlayingAudio: (state, action: PayloadAction<boolean>) => {
      state.isPlayingAudio = action.payload;
    },
    setVoiceId: (state, action: PayloadAction<string>) => {
      state.voiceId = action.payload;
    },
    setApiError: (state, action: PayloadAction<boolean>) => {
      state.hasApiError = action.payload;
    },
    setWaitingForResponse: (state, action: PayloadAction<boolean>) => {
      state.isWaitingForResponse = action.payload;
    },
    resetRecording: (state) => {
      state.recordingTime = 0;
      state.transcriptText = '';
      state.isRecording = false;
      state.isWaitingForResponse = false;
    },
  },
});

export const {
  setRecording,
  incrementRecordingTime,
  setTranscriptText,
  setGeneratingAudio,
  setPlayingAudio,
  setVoiceId,
  setApiError,
  setWaitingForResponse,
  resetRecording,
} = voiceSlice.actions;

export default voiceSlice.reducer;
