import useStore from '@store/store';
import { useTranslation } from 'react-i18next';
import {
  ChatInterface,
  ConfigInterface,
  MessageInterface,
  TextContentInterface,
} from '@type/chat';
import { getChatCompletion, getChatCompletionStream } from '@api/api';
import { parseEventSource } from '@api/helper';
import { limitMessageTokens, updateTotalTokenUsed } from '@utils/messageUtils';
import { _defaultChatConfig } from '@constants/chat';
import { officialAPIEndpoint } from '@constants/auth';
import { modelStreamSupport } from '@constants/modelLoader';

const useSubmit = () => {
  const { t, i18n } = useTranslation('api');
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const apiEndpoint = useStore((state) => state.apiEndpoint);
  const setGenerating = useStore((state) => state.setGenerating);
  const generating = useStore((state) => state.generating);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setChats = useStore((state) => state.setChats);

  // NEW: собрать список ключей из стора (array > string)
  const getSanitizedApiKeys = (): string[] => {
    const st = useStore.getState() as any;
    const list: string[] = (st.apiKeys as string[] | undefined) || [];
    if (list.length) return list;
    const single = st.apiKey as string | undefined;
    if (!single) return [];
    return single.split(/[,\n;\s]+/).map((k) => k.trim()).filter(Boolean);
  };

  // NEW: универсальный фолбэк по ключам
  const withKeyFailover = async <T>(fn: (key?: string) => Promise<T>) => {
    const keys = getSanitizedApiKeys();
    const endpoint = useStore.getState().apiEndpoint;

    if (!keys.length) {
      // без ключей — либо кастомный endpoint, либо ошибка на официальном
      if (endpoint === officialAPIEndpoint) {
        throw new Error(t('noApiKeyWarning') as string);
      }
      return { result: await fn(undefined), keyIndexUsed: null as number | null };
    }

    const startIndex =
      ((useStore.getState() as any).activeApiKeyIndex as number | undefined) ?? 0;
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
        // пробуем следующий ключ
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

  const handleSubmit = async () => {
    const chats = useStore.getState().chats;
    if (generating || !chats) return;

    const updatedChats: ChatInterface[] = JSON.parse(JSON.stringify(chats));

    updatedChats[currentChatIndex].messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: '' } as TextContentInterface],
    });

    setChats(updatedChats);
    setGenerating(true);

    try {
      const isStreamSupported =
        modelStreamSupport[chats[currentChatIndex].config.model];
      let data: any;
      let stream: ReadableStream<Uint8Array> | null | undefined;

      if (chats[currentChatIndex].messages.length === 0)
        throw new Error(t('errors.noMessagesSubmitted') as string);

      const messages = limitMessageTokens(
        chats[currentChatIndex].messages,
        chats[currentChatIndex].config.max_tokens,
        chats[currentChatIndex].config.model
      );
      if (messages.length === 0)
        throw new Error(t('errors.messageExceedMaxToken') as string);

      if (!isStreamSupported) {
        const res = await withKeyFailover((key) =>
          getChatCompletion(
            useStore.getState().apiEndpoint,
            messages,
            chats[currentChatIndex].config,
            key,
            undefined,
            useStore.getState().apiVersion
          )
        );
        data = res.result;

        if (
          !data ||
          !data.choices ||
          !data.choices[0] ||
          !data.choices[0].message ||
          !data.choices[0].message.content
        ) {
          throw new Error(t('errors.failedToRetrieveData') as string);
        }

        const updatedChats: ChatInterface[] = JSON.parse(
          JSON.stringify(useStore.getState().chats)
        );
        const updatedMessages = updatedChats[currentChatIndex].messages;
        (
          updatedMessages[updatedMessages.length - 1]
            .content[0] as TextContentInterface
        ).text += data.choices[0].message.content;
        setChats(updatedChats);
      } else {
        const res = await withKeyFailover((key) =>
          getChatCompletionStream(
            useStore.getState().apiEndpoint,
            messages,
            chats[currentChatIndex].config,
            key,
            undefined,
            useStore.getState().apiVersion
          )
        );
        stream = res.result;

        if (stream) {
          if (stream.locked)
            throw new Error(t('errors.streamLocked') as string);
          const reader = stream.getReader();
          let reading = true;
          let partial = '';
          while (reading && useStore.getState().generating) {
            const { done, value } = await reader.read();
            const result = parseEventSource(
              partial + new TextDecoder().decode(value)
            );
            partial = '';

            if (result === '[DONE]' || done) {
              reading = false;
            } else {
              const resultString = result.reduce((output: string, curr) => {
                if (typeof curr === 'string') {
                  partial += curr;
                } else {
                  if (
                    !curr.choices ||
                    !curr.choices[0] ||
                    !curr.choices[0].delta
                  ) {
                    return output;
                  }
                  const content = curr.choices[0]?.delta?.content ?? null;
                  if (content) output += content;
                }
                return output;
              }, '');

              const updatedChats: ChatInterface[] = JSON.parse(
                JSON.stringify(useStore.getState().chats)
              );
              const updatedMessages = updatedChats[currentChatIndex].messages;
              (
                updatedMessages[updatedMessages.length - 1]
                  .content[0] as TextContentInterface
              ).text += resultString;
              setChats(updatedChats);
            }
          }
          if (useStore.getState().generating) {
            reader.cancel(t('errors.cancelledByUser') as string);
          } else {
            reader.cancel(t('errors.generationCompleted') as string);
          }
          reader.releaseLock();
          stream.cancel();
        }
      }

      // tokens accounting
      const currChats = useStore.getState().chats;
      const countTotalTokens = useStore.getState().countTotalTokens;

      if (currChats && countTotalTokens) {
        const model = currChats[currentChatIndex].config.model;
        const messages = currChats[currentChatIndex].messages;
        updateTotalTokenUsed(
          model,
          messages.slice(0, -1),
          messages[messages.length - 1]
        );
      }

      // auto title
      if (
        useStore.getState().autoTitle &&
        currChats &&
        !currChats[currentChatIndex]?.titleSet
      ) {
        const messages_length = currChats[currentChatIndex].messages.length;
        const assistant_message =
          currChats[currentChatIndex].messages[messages_length - 1].content;
        const user_message =
          currChats[currentChatIndex].messages[messages_length - 2].content;

        const message: MessageInterface = {
          role: 'user',
          content: [
            ...user_message,
            ...assistant_message,
            {
              type: 'text',
              text: `Generate a title in less than 6 words for the conversation so far (language: ${i18n.language})`,
            } as TextContentInterface,
          ],
        };

        const updatedChats: ChatInterface[] = JSON.parse(
          JSON.stringify(useStore.getState().chats)
        );
        let title = (
          await generateTitle([message], updatedChats[currentChatIndex].config)
        ).trim();
        if (title.startsWith('"') && title.endsWith('"')) {
          title = title.slice(1, -1);
        }
        updatedChats[currentChatIndex].title = title;
        updatedChats[currentChatIndex].titleSet = true;
        setChats(updatedChats);

        if (countTotalTokens) {
          const model = _defaultChatConfig.model;
          updateTotalTokenUsed(model, [message], {
            role: 'assistant',
            content: [{ type: 'text', text: title } as TextContentInterface],
          });
        }
      }
    } catch (e: unknown) {
      const err = (e as Error).message;
      console.log(err);
      setError(err);
    }
    setGenerating(false);
  };

  return { handleSubmit, error };
};

export default useSubmit;
