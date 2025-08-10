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
  const { t, i18n } = useTranslation(['api', 'main']);
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const setGenerating = useStore((state) => state.setGenerating);
  const generating = useStore((state) => state.generating);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setChats = useStore((state) => state.setChats);

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
          useStore.getState().apiVersion
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

    while (reading && useStore.getState().generating) {
      const { done, value } = await reader.read();
      const result = parseEventSource(partial + new TextDecoder().decode(value));
      partial = '';

      if (result === '[DONE]' || done) {
        reading = false;
      } else {
        const resultString = result.reduce((output: string, curr) => {
          if (typeof curr === 'string') {
            partial += curr;
          } else if (curr?.choices?.[0]?.delta?.content) {
            output += curr.choices[0].delta.content;
          }
          return output;
        }, '');

        if (resultString) {
          fullText += resultString;
          if (callback) {
            callback(resultString);
          }
        }
      }
    }
    reader.releaseLock();
    stream.cancel();
    return fullText;
  };

  /**
   * Handles the standard submission process (single LLM).
   */
  const standardSubmit = async () => {
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
        getChatCompletionStream(apiEndpoint, messages, currentChat.config, key, undefined, useStore.getState().apiVersion)
      );

      if (stream) {
        await streamResponse(stream, (content) => {
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
      // Further logic like title generation could go here
    }
  };

  /**
   * Handles the two-stage auto-check submission process.
   */
  const autoCheckSubmit = async () => {
    console.log('[Auto-Check] Initiated.');
    const { chats, checkerConfig, checkerSystemMessage, streamFirstLLM, apiVersion } = useStore.getState();
    if (!chats) return;

    // Prepare assistant message
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

      console.log('[Auto-Check] Stage 1: Calling Primary LLM...');
      const { result: firstStream } = await withKeyFailover((key) =>
        getChatCompletionStream(apiEndpoint, originalMessages, currentChat.config, key, undefined, apiVersion)
      );

      let firstLLMResponse = '';
      if (firstStream) {
        const streamCallback = streamFirstLLM ? (content: string) => {
          const newChats: ChatInterface[] = JSON.parse(JSON.stringify(useStore.getState().chats));
          const lastMessage = newChats[currentChatIndex].messages[newChats[currentChatIndex].messages.length - 1];
          if (isTextContent(lastMessage.content[0])) {
            lastMessage.content[0].text += content;
          }
          setChats(newChats);
        } : undefined;

        firstLLMResponse = await streamResponse(firstStream, streamCallback);
      }
      console.log('[Auto-Check] Stage 1: Primary LLM response received:', firstLLMResponse);

      // Clear the message area before streaming the second response
      const preCheckChats: ChatInterface[] = JSON.parse(JSON.stringify(useStore.getState().chats));
      const lastMessageIndex = preCheckChats[currentChatIndex].messages.length - 1;
      preCheckChats[currentChatIndex].messages[lastMessageIndex].content = [{ type: 'text', text: '' }];
      setChats(preCheckChats);
      console.log('[Auto-Check] Cleared message area for checker response.');

      // =======================================================================
      // STAGE 2: Get improved response from the Checker LLM
      // =======================================================================
      const checkerPromptTemplate = checkerSystemMessage || "Тебе нужно проверить этот запрос:\n{first-llm-response}\nПерепиши его, сделав лучше";
      const checkerPromptContent = checkerPromptTemplate.replace('{first-llm-response}', firstLLMResponse);

      const checkerMessages: MessageInterface[] = [{ role: 'user', content: [{ type: 'text', text: checkerPromptContent }] }];
      console.log('[Auto-Check] Stage 2: Prompt for Checker LLM:', checkerPromptContent);

      console.log('[Auto-Check] Stage 2: Calling Checker LLM...');
      const { result: checkerStream } = await withKeyFailover((key) =>
        getChatCompletionStream(apiEndpoint, checkerMessages, checkerConfig, key, undefined, apiVersion)
      );

      if (checkerStream) {
        await streamResponse(checkerStream, (content) => {
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
      setError(err);
    } finally {
      setGenerating(false);
      // Further logic like title generation could go here
    }
  };

  const handleSubmit = async () => {
    if (generating) return;

    setError('');
    if (useStore.getState().autoCheck) {
      await autoCheckSubmit();
    } else {
      await standardSubmit();
    }
  };

  return { handleSubmit, error };
};

export default useSubmit;