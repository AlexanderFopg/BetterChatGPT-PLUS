import { StoreSlice } from './store';
import { ChatInterface, FolderCollection, MessageInterface } from '@type/chat';
import { toast } from 'react-toastify';

export interface ChatSlice {
  messages: MessageInterface[];
  chats?: ChatInterface[];
  currentChatIndex: number;
  generating: boolean;
  error: string;
  folders: FolderCollection;
  // Abort management for in-flight requests
  abortController?: AbortController;
  setAbortController: (controller?: AbortController) => void;
  cancelGeneration: () => void;

  setMessages: (messages: MessageInterface[]) => void;
  setChats: (chats: ChatInterface[]) => void;
  setCurrentChatIndex: (currentChatIndex: number) => void;
  setGenerating: (generating: boolean) => void;
  setError: (error: string) => void;
  setFolders: (folders: FolderCollection) => void;
}

export const createChatSlice: StoreSlice<ChatSlice> = (set, get) => {
  return {
    messages: [],
    currentChatIndex: -1,
    generating: false,
    error: '',
    folders: {},

    abortController: undefined,
    setAbortController: (controller?: AbortController) => {
      set((prev: ChatSlice) => ({
        ...prev,
        abortController: controller,
      }));
    },
    cancelGeneration: () => {
      const ac = get().abortController;
      try {
        if (ac && !ac.signal.aborted) ac.abort();
      } catch {}
      set((prev: ChatSlice) => ({
        ...prev,
        generating: false,
        abortController: undefined,
      }));
    },

    setMessages: (messages: MessageInterface[]) => {
      set((prev: ChatSlice) => ({
        ...prev,
        messages: messages,
      }));
    },
    setChats: (chats: ChatInterface[]) => {
      try {
        set((prev: ChatSlice) => ({
          ...prev,
          chats: chats,
        }));
      } catch (e: unknown) {
        // Notify if storage quota exceeded
        toast((e as Error).message);
        throw e;
      }
    },
    setCurrentChatIndex: (currentChatIndex: number) => {
      set((prev: ChatSlice) => ({
        ...prev,
        currentChatIndex: currentChatIndex,
      }));
    },
    setGenerating: (generating: boolean) => {
      // When turning off generating, also abort the in-flight request
      if (!generating) {
        const ac = get().abortController;
        try {
          if (ac && !ac.signal.aborted) ac.abort();
        } catch {}
        set((prev: ChatSlice) => ({
          ...prev,
          abortController: undefined,
        }));
      }

      set((prev: ChatSlice) => ({
        ...prev,
        generating: generating,
      }));
    },
    setError: (error: string) => {
      set((prev: ChatSlice) => ({
        ...prev,
        error: error,
      }));
    },
    setFolders: (folders: FolderCollection) => {
      set((prev: ChatSlice) => ({
        ...prev,
        folders: folders,
      }));
    },
  };
};