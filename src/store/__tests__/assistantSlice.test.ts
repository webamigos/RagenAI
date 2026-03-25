import { describe, it, expect } from 'vitest';
import assistantReducer, {
  setMessages,
  setLoading,
  setStreamedMessage,
  setError,
  setMessageLoadingText,
  setResponseType,
  setUserMessageId,
  setInitialLoad,
  setMode,
  setAssistantMode,
  setLimitLock,
  setMessagePlayed,
  clearMessages,
  setThreadContext,
  updateMentionedProject,
  removeMentionedProject,
  type AssistantState,
} from '../assistant/assistantSlice';
import {
  ChatResponseType,
  ChatType,
} from '@/features/messages/contracts/message.types';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';

// Get initial state from reducer
const initialState = assistantReducer(undefined, { type: '@@INIT' });

const mockMessage = {
  role: 'user' as const,
  content: 'Hello',
  createdAt: '2026-03-25T10:00:00Z',
  publicId: 'msg-1',
};

const mockMessage2 = {
  role: 'assistant' as const,
  content: 'Hi there!',
  createdAt: '2026-03-25T10:00:01Z',
  publicId: 'msg-2',
};

const mockThreadContext = {
  threadId: 'thread-1',
  projectId: 1,
  projectPublicId: 'proj-1',
  projectTitle: 'Test Project',
  mentionedProject: null,
  mentionedProjectId: null,
};

describe('assistantSlice', () => {
  it('returns initial state with correct defaults', () => {
    expect(initialState.messages).toEqual([]);
    expect(initialState.isLoading).toBe(false);
    expect(initialState.streamedMessage).toBeNull();
    expect(initialState.error).toBeNull();
    expect(initialState.messageLoadingText).toBe('');
    expect(initialState.responseType).toBe(ChatResponseType.TEXT);
    expect(initialState.userMessageId).toBe('');
    expect(initialState.isInitialLoad).toBe(true);
    expect(initialState.mode).toBe(ChatType.CONVERSATION);
    expect(initialState.assistantMode).toBe(AssistantMode.INTERNAL);
    expect(initialState.isLimitLock).toBe(false);
    expect(initialState.threadContext).toBeNull();
  });

  describe('setMessages', () => {
    it('sets messages array', () => {
      const messages = [mockMessage, mockMessage2] as any;
      const state = assistantReducer(initialState, setMessages(messages));
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].publicId).toBe('msg-1');
    });

    it('replaces existing messages', () => {
      const withMessages = {
        ...initialState,
        messages: [mockMessage] as any,
      };
      const state = assistantReducer(
        withMessages,
        setMessages([mockMessage2] as any),
      );
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].publicId).toBe('msg-2');
    });
  });

  describe('clearMessages', () => {
    it('clears messages and threadContext', () => {
      const withData = {
        ...initialState,
        messages: [mockMessage] as any,
        threadContext: mockThreadContext as any,
      };
      const state = assistantReducer(withData, clearMessages());
      expect(state.messages).toEqual([]);
      expect(state.threadContext).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('sets loading state', () => {
      const state = assistantReducer(initialState, setLoading(true));
      expect(state.isLoading).toBe(true);
    });
  });

  describe('setStreamedMessage', () => {
    it('sets streamed message', () => {
      const streamed = {
        content: 'Streaming...',
        createdAt: '2026-03-25T10:00:00Z',
        runId: 'run-1',
      };
      const state = assistantReducer(
        initialState,
        setStreamedMessage(streamed),
      );
      expect(state.streamedMessage).toEqual(streamed);
    });

    it('clears streamed message with null', () => {
      const withStreamed = {
        ...initialState,
        streamedMessage: {
          content: 'test',
          createdAt: '',
          runId: 'run-1',
        },
      };
      const state = assistantReducer(withStreamed, setStreamedMessage(null));
      expect(state.streamedMessage).toBeNull();
    });
  });

  describe('setError', () => {
    it('sets error message', () => {
      const state = assistantReducer(
        initialState,
        setError('Something went wrong'),
      );
      expect(state.error).toBe('Something went wrong');
    });

    it('clears error with null', () => {
      const withError = { ...initialState, error: 'Old error' };
      const state = assistantReducer(withError, setError(null));
      expect(state.error).toBeNull();
    });
  });

  describe('setMessageLoadingText', () => {
    it('sets loading text', () => {
      const state = assistantReducer(
        initialState,
        setMessageLoadingText('Thinking...'),
      );
      expect(state.messageLoadingText).toBe('Thinking...');
    });
  });

  describe('setResponseType', () => {
    it('sets response type to VOICE', () => {
      const state = assistantReducer(
        initialState,
        setResponseType(ChatResponseType.VOICE),
      );
      expect(state.responseType).toBe(ChatResponseType.VOICE);
    });

    it('sets response type to TEXT', () => {
      const withVoice = {
        ...initialState,
        responseType: ChatResponseType.VOICE,
      };
      const state = assistantReducer(
        withVoice,
        setResponseType(ChatResponseType.TEXT),
      );
      expect(state.responseType).toBe(ChatResponseType.TEXT);
    });
  });

  describe('setUserMessageId', () => {
    it('sets user message ID', () => {
      const state = assistantReducer(
        initialState,
        setUserMessageId('msg-user-1'),
      );
      expect(state.userMessageId).toBe('msg-user-1');
    });
  });

  describe('setInitialLoad', () => {
    it('sets initial load flag', () => {
      const state = assistantReducer(initialState, setInitialLoad(false));
      expect(state.isInitialLoad).toBe(false);
    });
  });

  describe('setMode', () => {
    it('sets chat mode to RAG', () => {
      const state = assistantReducer(initialState, setMode(ChatType.RAG));
      expect(state.mode).toBe(ChatType.RAG);
    });
  });

  describe('setAssistantMode', () => {
    it('sets assistant mode', () => {
      const state = assistantReducer(
        initialState,
        setAssistantMode(AssistantMode.INTERNAL),
      );
      expect(state.assistantMode).toBe(AssistantMode.INTERNAL);
    });
  });

  describe('setLimitLock', () => {
    it('sets limit lock', () => {
      const state = assistantReducer(initialState, setLimitLock(true));
      expect(state.isLimitLock).toBe(true);
    });
  });

  describe('setMessagePlayed', () => {
    it('marks specific message as voice played', () => {
      const withMessages = {
        ...initialState,
        messages: [
          { ...mockMessage, voicePlayed: false },
          { ...mockMessage2, voicePlayed: false },
        ] as any,
      };
      const state = assistantReducer(withMessages, setMessagePlayed('msg-1'));
      expect(state.messages[0].voicePlayed).toBe(true);
      expect(state.messages[1].voicePlayed).toBe(false);
    });

    it('does nothing when message ID not found', () => {
      const withMessages = {
        ...initialState,
        messages: [mockMessage] as any,
      };
      const state = assistantReducer(
        withMessages,
        setMessagePlayed('nonexistent'),
      );
      expect(state.messages[0].voicePlayed).toBeUndefined();
    });
  });

  describe('setThreadContext', () => {
    it('sets thread context', () => {
      const state = assistantReducer(
        initialState,
        setThreadContext(mockThreadContext as any),
      );
      expect(state.threadContext).toEqual(mockThreadContext);
    });

    it('clears thread context with null', () => {
      const withContext = {
        ...initialState,
        threadContext: mockThreadContext as any,
      };
      const state = assistantReducer(withContext, setThreadContext(null));
      expect(state.threadContext).toBeNull();
    });
  });

  describe('updateMentionedProject', () => {
    it('updates mentioned project in thread context', () => {
      const withContext = {
        ...initialState,
        threadContext: { ...mockThreadContext } as any,
      };
      const project = { id: 5, publicId: 'proj-5', title: 'New Project' };
      const state = assistantReducer(
        withContext,
        updateMentionedProject(project),
      );
      expect(state.threadContext?.mentionedProject).toEqual(project);
      expect(state.threadContext?.mentionedProjectId).toBe(5);
    });

    it('clears mentioned project with null', () => {
      const withMention = {
        ...initialState,
        threadContext: {
          ...mockThreadContext,
          mentionedProject: { id: 5, publicId: 'p', title: 'P' },
          mentionedProjectId: 5,
        } as any,
      };
      const state = assistantReducer(withMention, updateMentionedProject(null));
      expect(state.threadContext?.mentionedProject).toBeNull();
      expect(state.threadContext?.mentionedProjectId).toBeNull();
    });

    it('does nothing when threadContext is null', () => {
      const state = assistantReducer(
        initialState,
        updateMentionedProject({ id: 1, publicId: 'p', title: 'P' }),
      );
      expect(state.threadContext).toBeNull();
    });
  });

  describe('removeMentionedProject', () => {
    it('removes mentioned project from thread context', () => {
      const withMention = {
        ...initialState,
        threadContext: {
          ...mockThreadContext,
          mentionedProject: { id: 5, publicId: 'p', title: 'P' },
          mentionedProjectId: 5,
        } as any,
      };
      const state = assistantReducer(withMention, removeMentionedProject());
      expect(state.threadContext?.mentionedProject).toBeNull();
      expect(state.threadContext?.mentionedProjectId).toBeNull();
    });

    it('does nothing when threadContext is null', () => {
      const state = assistantReducer(initialState, removeMentionedProject());
      expect(state.threadContext).toBeNull();
    });
  });
});
