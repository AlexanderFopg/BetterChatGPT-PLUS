import { defaultAPIEndpoint } from '@constants/auth';
import { StoreSlice } from './store';

export interface AuthSlice {
  apiKeys: string[];
  activeApiKeyIndex: number;
  apiEndpoint: string;
  apiVersion?: string;
  firstVisit: boolean;
  setApiKey: (apiKey: string) => void; // Оставляем для обратной совместимости и первого входа
  addApiKey: (apiKey: string) => void; // Новый метод для добавления одного ключа
  removeApiKey: (index: number) => void; // Новый метод для удаления ключа
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
    apiKeys: initialKeys,
    activeApiKeyIndex: 0,
    apiEndpoint: defaultAPIEndpoint,
    apiVersion: undefined,
    firstVisit: true,

    // Этот метод вызывается из ApiPopup и старого поля ввода. Он перезаписывает все ключи.
    setApiKey: (apiKey: string) => {
      const newKeys = parseKeys(apiKey);
      set({
        apiKeys: newKeys,
        activeApiKeyIndex: 0,
      });
    },

    // Новый метод: добавляет один ключ, избегая дубликатов
    addApiKey: (apiKey: string) => {
      if (!apiKey.trim()) return;
      set((prev) => {
        if (prev.apiKeys.includes(apiKey.trim())) return prev; // Ключ уже существует
        return { apiKeys: [...prev.apiKeys, apiKey.trim()] };
      });
    },

    // Новый метод: удаляет ключ по индексу
    removeApiKey: (index: number) => {
      set((prev) => {
        const newApiKeys = [...prev.apiKeys];
        if (index < 0 || index >= newApiKeys.length) return prev; // Неверный индекс

        newApiKeys.splice(index, 1);

        // Корректируем активный индекс, если он указывает на удаленный ключ
        const activeIndex = prev.activeApiKeyIndex;
        let newActiveIndex = activeIndex;
        if (activeIndex === index) {
          newActiveIndex = 0;
        } else if (activeIndex > index) {
          newActiveIndex = activeIndex - 1;
        }

        return {
          apiKeys: newApiKeys,
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
    setFirstVisit: (firstVisit: boolean) => {
      set({ firstVisit });
    },
  };
};