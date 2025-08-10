import { defaultAPIEndpoint } from '@constants/auth';
import { StoreSlice } from './store';

export interface AuthSlice {
  apiKey?: string;
  apiKeys: string[]; // NEW
  activeApiKeyIndex: number; // NEW
  apiEndpoint: string;
  apiVersion?: string;
  firstVisit: boolean;
  setApiKey: (apiKey: string) => void;
  setApiKeys: (apiKeys: string[]) => void; // NEW
  setActiveApiKeyIndex: (i: number) => void; // NEW
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
  const envOne = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  const envMany = import.meta.env.VITE_OPENAI_API_KEYS as string | undefined;
  const initialKeys = parseKeys(envMany ?? envOne ?? '');

  return {
    apiKey: envOne || undefined,
    apiKeys: initialKeys, // NEW
    activeApiKeyIndex: 0, // NEW
    apiEndpoint: defaultAPIEndpoint,
    apiVersion: undefined,
    firstVisit: true,

    setApiKey: (apiKey: string) => {
      set((prev: AuthSlice) => ({
        ...prev,
        apiKey,
        apiKeys: parseKeys(apiKey), // авто‑парсинг нескольких ключей
        activeApiKeyIndex: 0,
      }));
    },

    setApiKeys: (apiKeys: string[]) => {
      const cleaned = parseKeys(apiKeys);
      set((prev: AuthSlice) => ({
        ...prev,
        apiKeys: cleaned,
        apiKey: cleaned.join(', '), // чтобы UI видел строку в старом поле
        activeApiKeyIndex: 0,
      }));
    },

    setActiveApiKeyIndex: (i: number) => {
      set((prev: AuthSlice) => ({
        ...prev,
        activeApiKeyIndex: i,
      }));
    },

    setApiEndpoint: (apiEndpoint: string) => {
      set((prev: AuthSlice) => ({
        ...prev,
        apiEndpoint,
      }));
    },
    setApiVersion: (apiVersion: string) => {
      set((prev: AuthSlice) => ({
        ...prev,
        apiVersion,
      }));
    },
    setFirstVisit: (firstVisit: boolean) => {
      set((prev: AuthSlice) => ({
        ...prev,
        firstVisit,
      }));
    },
  };
};