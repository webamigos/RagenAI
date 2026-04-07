import { describe, it, expect } from 'vitest';
import voiceReducer, {
  setRecording,
  incrementRecordingTime,
  setTranscriptText,
  setGeneratingAudio,
  setPlayingAudio,
  setVoiceId,
  setApiError,
  setWaitingForResponse,
  resetRecording,
  type VoiceState,
} from '../voice/voiceSlice';

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

describe('voiceSlice', () => {
  it('returns initial state', () => {
    expect(voiceReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  describe('setRecording', () => {
    it('sets recording to true', () => {
      const state = voiceReducer(initialState, setRecording(true));
      expect(state.isRecording).toBe(true);
    });

    it('sets recording to false', () => {
      const recording = { ...initialState, isRecording: true };
      const state = voiceReducer(recording, setRecording(false));
      expect(state.isRecording).toBe(false);
    });

    it('sets isWaitingForResponse when stopping with transcript text', () => {
      const recording = {
        ...initialState,
        isRecording: true,
        transcriptText: 'Hello world',
      };
      const state = voiceReducer(recording, setRecording(false));
      expect(state.isWaitingForResponse).toBe(true);
    });

    it('does not set isWaitingForResponse when stopping with empty transcript', () => {
      const recording = {
        ...initialState,
        isRecording: true,
        transcriptText: '   ',
      };
      const state = voiceReducer(recording, setRecording(false));
      expect(state.isWaitingForResponse).toBe(false);
    });
  });

  describe('incrementRecordingTime', () => {
    it('increments recording time by 1', () => {
      const state = voiceReducer(initialState, incrementRecordingTime());
      expect(state.recordingTime).toBe(1);
    });

    it('increments cumulatively', () => {
      let state = voiceReducer(initialState, incrementRecordingTime());
      state = voiceReducer(state, incrementRecordingTime());
      state = voiceReducer(state, incrementRecordingTime());
      expect(state.recordingTime).toBe(3);
    });
  });

  describe('setTranscriptText', () => {
    it('sets transcript text', () => {
      const state = voiceReducer(
        initialState,
        setTranscriptText('Hello world'),
      );
      expect(state.transcriptText).toBe('Hello world');
    });
  });

  describe('setGeneratingAudio', () => {
    it('sets generating audio state', () => {
      const state = voiceReducer(initialState, setGeneratingAudio(true));
      expect(state.isGeneratingAudio).toBe(true);
    });
  });

  describe('setPlayingAudio', () => {
    it('sets playing audio state', () => {
      const state = voiceReducer(initialState, setPlayingAudio(true));
      expect(state.isPlayingAudio).toBe(true);
    });
  });

  describe('setVoiceId', () => {
    it('sets voice ID', () => {
      const state = voiceReducer(initialState, setVoiceId('voice-123'));
      expect(state.voiceId).toBe('voice-123');
    });
  });

  describe('setApiError', () => {
    it('sets API error flag', () => {
      const state = voiceReducer(initialState, setApiError(true));
      expect(state.hasApiError).toBe(true);
    });
  });

  describe('setWaitingForResponse', () => {
    it('sets waiting for response', () => {
      const state = voiceReducer(initialState, setWaitingForResponse(true));
      expect(state.isWaitingForResponse).toBe(true);
    });
  });

  describe('resetRecording', () => {
    it('resets all recording state', () => {
      const modified: VoiceState = {
        ...initialState,
        isRecording: true,
        recordingTime: 45,
        transcriptText: 'Some recorded text',
        isWaitingForResponse: true,
      };
      const state = voiceReducer(modified, resetRecording());
      expect(state.isRecording).toBe(false);
      expect(state.recordingTime).toBe(0);
      expect(state.transcriptText).toBe('');
      expect(state.isWaitingForResponse).toBe(false);
    });

    it('preserves non-recording state', () => {
      const modified: VoiceState = {
        ...initialState,
        isRecording: true,
        voiceId: 'voice-abc',
        isPlayingAudio: true,
      };
      const state = voiceReducer(modified, resetRecording());
      expect(state.voiceId).toBe('voice-abc');
      expect(state.isPlayingAudio).toBe(true);
    });
  });
});
