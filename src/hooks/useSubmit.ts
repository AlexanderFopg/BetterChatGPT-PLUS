import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import {
  ChatInterface,
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
  isTextContent,
} from '@type/chat';
import { getChatCompletion, getChatCompletionStream } from '@api/api';
import { parseEventSource } from '@api/helper';
import { limitMessageTokens, updateTotalTokenUsed } from '@utils/messageUtils';
import { _defaultChatConfig } from '@constants/chat';
import { officialAPIEndpoint } from '@constants/auth';
import { modelStreamSupport } from '@constants/modelLoader';

const useSubmit = () => {
  const { t } = useTranslation(['api', 'main']);
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const setGenerating = useStore((state) => state.setGenerating);
  const generating = useStore((state) => state.generating);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setChats = useStore((state) => state.setChats);
  const abortController = useStore((state) => state.abortController);
  const setAbortController = useStore((state) => state.setAbortController);

  const getSanitizedApiKeys = (): string[] => {
    const st = useStore.getState() as any;
    const list: string[] = (st.apiKeys as string[] | undefined) || [];
    if (list.length) return list;
    const single = st.apiKey as string | undefined;
    if (!single) return [];
    return single.split(/[,\n;\s]+/).map((k) => k.trim()).filter(Boolean);
  };

  const withKeyFailover = async <T>(fn: (key?: string) => Promise<T>) => {
    const keys = getSanitizedApiKeys();
    const endpoint = useStore.getState().apiEndpoint;

    if (!keys.length) {
      if (endpoint === officialAPIEndpoint) {
        throw new Error(t('noApiKeyWarning') as string);
      }
      return { result: await fn(undefined), keyIndexUsed: null as number | null };
    }

    const startIndex = ((useStore.getState() as any).activeApiKeyIndex as number | undefined) ?? 0;
    const n = keys.length;
    let lastError: unknown;

    for (let i = 0; i < n; i++) {
      const idx = (startIndex + i) % n;
      const key = keys[idx];
      try {
        const result = await fn(key);
        const setIdx = (useStore.getState() as any).setActiveApiKeyIndex;
        if (setIdx) setIdx(idx);
        return { result, keyIndexUsed: idx };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error('All API keys failed');
  };

  const generateTitle = async (
    message: MessageInterface[],
    modelConfig: ConfigInterface
  ): Promise<string> => {
    try {
      const titleChatConfig = {
        ...modelConfig,
        model: useStore.getState().titleModel ?? modelConfig.model,
      };
      const { result: data } = await withKeyFailover((key) =>
        getChatCompletion(
          useStore.getState().apiEndpoint,
          message,
          titleChatConfig,
          key,
          undefined,
          useStore.getState().apiVersion,
          useStore.getState().abortController?.signal
        )
      );
      return data.choices[0].message.content;
    } catch (error: unknown) {
      throw new Error(
        `${t('errors.errorGeneratingTitle')}\n${(error as Error).message}`
      );
    }
  };

  /**
   * Streams a response from an LLM and calls a callback with new content chunks.
   * Returns the full response text once streaming is complete.
   */
  const streamResponse = async (
    stream: ReadableStream<Uint8Array>,
    callback?: (content: string) => void
  ): Promise<string> => {
    let fullText = '';
    if (stream.locked) throw new Error(t('errors.streamLocked', { ns: 'api' }) as string);
    const reader = stream.getReader();
    let reading = true;
    let partial = '';

    try {
      while (reading) {
        if (!useStore.getState().generating) break;

        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        const decodedChunk = new TextDecoder().decode(value);
        const parsed = parseEventSource(partial + decodedChunk);
        partial = parsed.remainder;

        if (parsed.done) {
          reading = false;
        } else if (parsed.events && parsed.events.length) {
          const resultString = parsed.events.reduce((output: string, curr) => {
            if (typeof curr !== 'string' && (curr as any).choices && (curr as any).choices[0]?.delta?.content) {
              output += (curr as any).choices[0].delta.content;
            }
            return output;
          }, '');

          if (resultString) {
            fullText += resultString;
            if (callback) callback(resultString);
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {}
      try {
        // cancel the stream to free network resources
        await stream.cancel();
      } catch {}
    }

    return fullText;
  };

  /**
   * Handles the standard submission process (single LLM).
   */
  const standardSubmit = async (controller: AbortController) => {
    console.log('[Standard Submit] Initiated.');
    const chats = useStore.getState().chats;
    if (!chats) return;

    const updatedChats: ChatInterface[] = JSON.parse(JSON.stringify(chats));
    const currentChat = updatedChats[currentChatIndex];
    currentChat.messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: '' } as TextContentInterface],
    });
    setChats(updatedChats);
    setGenerating(true);

    try {
      const messages = limitMessageTokens(
        currentChat.messages.slice(0, -1),
        currentChat.config.max_tokens,
        currentChat.config.model
      );
      if (messages.length === 0) throw new Error(t('errors.messageExceedMaxToken', { ns: 'api' }) as string);

      console.log('[Standard Submit] Calling LLM...');
      const { result: stream } = await withKeyFailover((key) =>
        getChatCompletionStream(
          apiEndpoint,
          messages,
          currentChat.config,
          key,
          undefined,
          useStore.getState().apiVersion,
          controller.signal
        )
      );

      if (stream) {
        await streamResponse(stream, (content) => {
          if (!useStore.getState().generating) return;
          const newChats: ChatInterface[] = JSON.parse(JSON.stringify(useStore.getState().chats));
          const lastMessage = newChats[currentChatIndex].messages[newChats[currentChatIndex].messages.length - 1];
          if (isTextContent(lastMessage.content[0])) {
            lastMessage.content[0].text += content;
          }
          setChats(newChats);
        });
      }
      console.log('[Standard Submit] Streaming complete.');
    } catch (e) {
      const err = (e as Error).message;
      console.error('[Standard Submit] Error:', err);
      setError(err);
    } finally {
      setGenerating(false);
      setAbortController(undefined);
    }
  };

  /**
   * Handles the two-stage auto-check submission process.
   */
  const autoCheckSubmit = async (controller: AbortController) => {
    console.log('[Auto-Check] Initiated.');
    const { chats, checkerConfig, checkerSystemMessage, streamFirstLLM, apiVersion } = useStore.getState();
    if (!chats) return;

    const updatedChats: ChatInterface[] = JSON.parse(JSON.stringify(chats));
    const currentChat = updatedChats[currentChatIndex];
    currentChat.messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: '' } as TextContentInterface],
    });
    setChats(updatedChats);
    setGenerating(true);

    try {
      // =======================================================================
      // STAGE 1: Get response from the Primary LLM
      // =======================================================================
      const originalMessages = limitMessageTokens(
        currentChat.messages.slice(0, -1),
        currentChat.config.max_tokens,
        currentChat.config.model
      );
      if (originalMessages.length === 0) throw new Error(t('errors.messageExceedMaxToken', { ns: 'api' }) as string);

      console.log('[Auto-Check] Stage 1: Calling Primary LLM with payload:', JSON.stringify({messages: originalMessages, model: currentChat.config.model}));
      const { result: firstStream } = await withKeyFailover((key) =>
        getChatCompletionStream(
          apiEndpoint,
          originalMessages,
          currentChat.config,
          key,
          undefined,
          apiVersion,
          controller.signal
        )
      );

      let firstLLMResponse = '';
      if (firstStream) {
        const streamCallback = streamFirstLLM ? (content: string) => {
          if (!useStore.getState().generating) return;
          const newChats: ChatInterface[] = JSON.parse(JSON.stringify(useStore.getState().chats));
          const lastMessage = newChats[currentChatIndex].messages[newChats[currentChatIndex].messages.length - 1];
          if (isTextContent(lastMessage.content[0])) {
            lastMessage.content[0].text += content;
          }
          setChats(newChats);
        } : undefined;

        firstLLMResponse = await streamResponse(firstStream, streamCallback);
      }
      console.log('[Auto-Check] Stage 1: Primary LLM response received:', `"${firstLLMResponse}"`);

      // Если отменили во время Stage 1 — не выполняем Stage 2
      if (!useStore.getState().generating || controller.signal.aborted) {
        console.log('[Auto-Check] Canceled after Stage 1. Skipping Stage 2.');
        return;
      }

      // Если Stage 1 не дал текста — не выполняем Stage 2
      if (!firstLLMResponse || !firstLLMResponse.trim()) {
        console.log('[Auto-Check] Stage 1 produced empty response. Skipping Stage 2.');
        return;
      }

      // Очистка последнего assistant-сообщения перед стримом Stage 2
      const preCheckChats: ChatInterface[] = JSON.parse(JSON.stringify(useStore.getState().chats));
      const lastMessageIndex = preCheckChats[currentChatIndex].messages.length - 1;
      preCheckChats[currentChatIndex].messages[lastMessageIndex].content = [{ type: 'text', text: '' }];
      setChats(preCheckChats);
      console.log('[Auto-Check] Cleared message area for checker response.');

      // =======================================================================
      // STAGE 2: Get improved response from the Checker LLM
      // =======================================================================

      // Вытаскиваем последний пользовательский запрос (если есть)
      const lastUserMsg = [...originalMessages].reverse().find((m) => m.role === 'user');
      let lastUserText = '';
      if (lastUserMsg && Array.isArray(lastUserMsg.content)) {
        lastUserText = lastUserMsg.content
          .map((c: any) => (c?.type === 'text' ? c.text : ''))
          .filter(Boolean)
          .join('\n\n');
      }

    const defaultTemplate =
      'Пользователь запросил: {user-request}\nLlm ответила: {llm-response}\nВсё ли в порядке? Улучши её ответ';

    const template =
      checkerSystemMessage && checkerSystemMessage.trim().length
        ? checkerSystemMessage
        : defaultTemplate;

    // Раньше было split/join, чтобы заменить все вхождения без replaceAll.
    // Теперь используем replace с глобальными regex — читабельнее и заменяет все вхождения.
    // Поддерживаем также legacy-плейсхолдеры для совместимости.
    let userPrompt = template
      .replace(/\{user-request\}/g, lastUserText)
      .replace(/\{llm-response\}/g, firstLLMResponse)

    // Фолбэк: если в шаблоне не было ни одного плейсхолдера — добавим всё вручную
    if (userPrompt === template) {
      const pieces: string[] = [];
      if (lastUserText) pieces.push(`Пользователь запросил:\n${lastUserText}`);
      pieces.push(`Llm ответила:\n${firstLLMResponse}`);
      pieces.push('Улучшите ответ (Markdown).');
      userPrompt = pieces.join('\n\n');
    }

    const checkerMessages: MessageInterface[] = [
      { role: 'user', content: [{ type: 'text', text: userPrompt }] as any },
    ];

      console.log('[Auto-Check] Stage 2: Calling Checker LLM with payload:', JSON.stringify({messages: checkerMessages, model: checkerConfig.model}));

      const { result: checkerStream } = await withKeyFailover((key) =>
        getChatCompletionStream(
          apiEndpoint,
          checkerMessages,
          checkerConfig,
          key,
          undefined,
          apiVersion,
          controller.signal
        )
      );

      if (!useStore.getState().generating || controller.signal.aborted) {
        console.log('[Auto-Check] Canceled before streaming Stage 2. Skipping.');
        return;
      }

      if (checkerStream) {
        await streamResponse(checkerStream, (content) => {
          if (!useStore.getState().generating) return;
          const newChats: ChatInterface[] = JSON.parse(JSON.stringify(useStore.getState().chats));
          const lastMessage = newChats[currentChatIndex].messages[newChats[currentChatIndex].messages.length - 1];
          if (isTextContent(lastMessage.content[0])) {
            lastMessage.content[0].text += content;
          }
          setChats(newChats);
        });
      }
      console.log('[Auto-Check] Stage 2: Checker LLM streaming complete.');
    } catch (e) {
      const err = (e as Error).message;
      console.error('[Auto-Check] Error:', err);
      setError(`[Auto-Check Error]: ${err}`);
    } finally {
      setGenerating(false);
      setAbortController(undefined);
    }
  };

  const handleSubmit = async () => {
    if (generating) return;

    setError('');
    const controller = new AbortController();
    setAbortController(controller);

    if (useStore.getState().autoCheck) {
      await autoCheckSubmit(controller);
    } else {
      await standardSubmit(controller);
    }
  };

  return { handleSubmit, error };
};

export default useSubmit;