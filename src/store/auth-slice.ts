import { defaultAPIEndpoint } from '@constants/auth';
import { StoreSlice } from './store';

export interface AuthSlice {
  apiKey?: string; // Возвращаем это поле
  apiKeys: string[];
  activeApiKeyIndex: number;
  apiEndpoint: string;
  apiVersion?: string;
  firstVisit: boolean;
  apiRequestBody?: string;
  setApiKey: (apiKey: string) => void;
  addApiKey: (apiKey: string) => void;
  removeApiKey: (index: number) => void;
  setActiveApiKeyIndex: (i: number) => void;
  setApiEndpoint: (apiEndpoint: string) => void;
  setApiVersion: (apiVersion: string) => void;
  setFirstVisit: (firstVisit: boolean) => void;
}

const parseKeys = (input?: string | string[]): string[] => {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : input.split(/[,\n;\s]+/);
  return raw.map((s) => s.trim()).filter(Boolean);
};

export const createAuthSlice: StoreSlice<AuthSlice> = (set, get) => {
  const envKeysString = import.meta.env.VITE_OPENAI_API_KEYS || import.meta.env.VITE_OPENAI_API_KEY;
  const initialKeys = parseKeys(envKeysString);

  return {
    apiKey: initialKeys.join(', '), // Инициализируем и старое поле
    apiKeys: initialKeys,
    activeApiKeyIndex: 0,
    apiEndpoint: defaultAPIEndpoint,
    apiVersion: undefined,
    apiRequestBody: '',
    firstVisit: true,

    setApiKey: (apiKey: string) => {
      const newKeys = parseKeys(apiKey);
      set({
        apiKey: apiKey, // Обновляем строку
        apiKeys: newKeys, // Обновляем массив
        activeApiKeyIndex: 0,
      });
    },

    addApiKey: (apiKey: string) => {
      if (!apiKey.trim()) return;
      set((prev) => {
        if (prev.apiKeys.includes(apiKey.trim())) return prev;
        const newApiKeys = [...prev.apiKeys, apiKey.trim()];
        return {
          apiKeys: newApiKeys,
          apiKey: newApiKeys.join(', '), // Синхронизируем строку
        };
      });
    },

    removeApiKey: (index: number) => {
      set((prev) => {
        const newApiKeys = [...prev.apiKeys];
        if (index < 0 || index >= newApiKeys.length) return prev;

        newApiKeys.splice(index, 1);

        let newActiveIndex = prev.activeApiKeyIndex;
        if (newActiveIndex === index) {
          newActiveIndex = 0;
        } else if (newActiveIndex > index) {
          newActiveIndex = newActiveIndex - 1;
        }

        return {
          apiKeys: newApiKeys,
          apiKey: newApiKeys.join(', '), // Синхронизируем строку
          activeApiKeyIndex: newActiveIndex,
        };
      });
    },

    setActiveApiKeyIndex: (i: number) => {
      set((prev) => {
        if (i >= 0 && i < prev.apiKeys.length) {
          return { activeApiKeyIndex: i };
        }
        return prev;
      });
    },

    setApiEndpoint: (apiEndpoint: string) => {
      set({ apiEndpoint });
    },
    setApiVersion: (apiVersion: string) => {
      set({ apiVersion });
    },
    setApiRequestBody: (body: string) => {
      set({ apiRequestBody: body });
    },
    setFirstVisit: (firstVisit: boolean) => {
      set({ firstVisit });
    },
  };
};