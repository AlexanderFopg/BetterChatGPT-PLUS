import { ShareGPTSubmitBodyInterface } from '@type/api';
import {
  ConfigInterface,
  MessageInterface,
} from '@type/chat';
import { isAzureEndpoint } from '@utils/api';
import { ModelOptions } from '@utils/modelReader';
import useStore from '@store/store';

/**
 * Normalize messages for providers that expect `content` to be a plain string.
 * If a message has only text parts, it will be converted to `{ role, content: string }`.
 * Mixed/multimodal messages remain unchanged.
 */
const normalizeMessagesForProvider = (messages: MessageInterface[]) => {
  return messages.map((m) => {
    const content = Array.isArray(m.content) ? m.content : [];
    const allText =
      content.length > 0 &&
      content.every(
        (c) => c && c.type === 'text' && typeof (c as any).text === 'string'
      );

    if (allText) {
      const joined = content.map((c: any) => c.text).join('\n\n');
      return { role: m.role, content: joined };
    }
    // leave as-is (for multimodal or already string)
    return m as any;
  });
};

const getCustomBody = () => {
  const customBodyString = useStore.getState().apiRequestBody;
  if (!customBodyString) return {};
  try {
    return JSON.parse(customBodyString);
  } catch (e) {
    console.error('Invalid JSON in custom request body, ignoring. Error:', e);
    // В будущем можно добавить уведомление для пользователя
    return {};
  }
};

export const getChatCompletion = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
  abortSignal?: AbortSignal
) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const modelmapping: Partial<Record<ModelOptions, string>> = {
      'gpt-3.5-turbo': 'gpt-35-turbo',
      'gpt-3.5-turbo-16k': 'gpt-35-turbo-16k',
      'gpt-3.5-turbo-1106': 'gpt-35-turbo-1106',
      'gpt-3.5-turbo-0125': 'gpt-35-turbo-0125',
    };

    const model = modelmapping[config.model] || config.model;

    const apiVersion =
      apiVersionToUse ??
      (model === 'gpt-4' || model === 'gpt-4-32k'
        ? '2023-07-01-preview'
        : '2023-03-15-preview');

    const path = `openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }
  endpoint = endpoint.trim();

  const customBody = getCustomBody(); // <-- ПОЛУЧАЕМ КАСТОМНЫЕ ПОЛЯ
  const payloadMessages = normalizeMessagesForProvider(messages);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal: abortSignal,
    body: JSON.stringify({
      messages: payloadMessages,
      ...Object.fromEntries(Object.entries(config).filter(([key]) => !(config.excludedFields || []).includes(key))),
      ...customBody, // <-- "ПОДМЕШИВАЕМ" КАСТОМНЫЕ ПОЛЯ В ЗАПРОС
      max_tokens: undefined,
    }),
  });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return data;
};

export const getChatCompletionStream = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
  abortSignal?: AbortSignal
) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const modelmapping: Partial<Record<ModelOptions, string>> = {
      'gpt-3.5-turbo': 'gpt-35-turbo',
      'gpt-3.5-turbo-16k': 'gpt-35-turbo-16k',
    };

    const model = modelmapping[config.model] || config.model;

    const apiVersion =
      apiVersionToUse ??
      (model === 'gpt-4' || model === 'gpt-4-32k'
        ? '2023-07-01-preview'
        : '2023-03-15-preview');
    const path = `openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }
  endpoint = endpoint.trim();

  const customBody = getCustomBody(); // <-- ПОЛУЧАЕМ КАСТОМНЫЕ ПОЛЯ
  const payloadMessages = normalizeMessagesForProvider(messages);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal: abortSignal,
    body: JSON.stringify({
      messages: payloadMessages,
      ...config,
      ...customBody, // <-- "ПОДМЕШИВАЕМ" КАСТОМНЫЕ ПОЛЯ В ЗАПРОС
      max_tokens: undefined,
      stream: true,
    }),
  });
  if (response.status === 404 || response.status === 405) {
    const text = await response.text();

    if (text.includes('model_not_found')) {
      throw new Error(
        text +
          '\nMessage from Better ChatGPT:\nPlease ensure that you have access to the GPT-4 API!'
      );
    } else {
      throw new Error(
        'Message from Better ChatGPT:\nInvalid API endpoint! We recommend you to check your free API endpoint.'
      );
    }
  }

  if (response.status === 429 || !response.ok) {
    const text = await response.text();
    let error = text;
    if (text.includes('insufficient_quota')) {
      error +=
        '\nMessage from Better ChatGPT:\nWe recommend changing your API endpoint or API key';
    } else if (response.status === 429) {
      error += '\nRate limited!';
    }
    throw new Error(error);
  }

  const stream = response.body;
  return stream;
};

export const submitShareGPT = async (body: ShareGPTSubmitBodyInterface) => {
  const request = await fetch('https://sharegpt.com/api/conversations', {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const response = await request.json();
  const { id } = response;
  const url = `https://shareg.pt/${id}`;
  window.open(url, '_blank');
};