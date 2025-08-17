import React, {
  memo,
  useEffect,
  useState,
  useRef,
  useCallback,
  ChangeEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

import useSubmit from '@hooks/useSubmit';

import {
  ChatInterface,
  ContentInterface,
  ImageContentInterface,
  TextContentInterface,
} from '@type/chat';

import PopupModal from '@components/PopupModal';
import TokenCount from '@components/TokenCount';
import CommandPrompt from '../CommandPrompt';
import { defaultModel } from '@constants/chat';
import AttachmentIcon from '@icon/AttachmentIcon';
import { ModelOptions } from '@utils/modelReader';
import { modelTypes } from '@constants/modelLoader';
import { toast } from 'react-toastify';

// ——— helpers ———

const isTextContent = (
  content: ContentInterface
): content is TextContentInterface => content.type === 'text';

function useAutoResizeTextArea(ref: React.RefObject<HTMLTextAreaElement>) {
  const rafId = useRef<number | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const MAX = Math.floor(window.innerHeight * 0.6); // ограничим рост до 60vh
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    const newH = Math.min(scrollH, MAX);
    el.style.height = `${newH}px`;
    el.style.overflowY = scrollH > MAX ? 'auto' : 'hidden';
  }, [ref]);

  const schedule = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(resize);
  }, [resize]);

  useEffect(() => {
    schedule();
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [schedule]);

  return schedule;
}

const EditView = ({
  content,
  setIsEdit,
  messageIndex,
  sticky,
}: {
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  sticky?: boolean;
}) => {
  const { t } = useTranslation();

  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);
  const inputRole = useStore((state) => state.inputRole);
  const setChats = useStore((state) => state.setChats);
  const advancedMode = useStore((state) => state.advancedMode);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const chats = useStore((state) => state.chats);

  const model = useStore((state) => {
    const hasChats =
      state.chats &&
      state.chats.length > 0 &&
      state.currentChatIndex >= 0 &&
      state.currentChatIndex < state.chats.length;

    // избегаем побочного эффекта в селекторе — просто дефолтимся
    return hasChats
      ? state.chats![state.currentChatIndex].config.model
      : defaultModel;
  });

  // локально храним только массив контента — это недорого, и текст в textarea НЕ контролируем
  const [_content, _setContent] = useState<ContentInterface[]>(content);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scheduleResize = useAutoResizeTextArea(textareaRef);

  const resetTextAreaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    scheduleResize();
  }, [scheduleResize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|playbook|silk/i.test(
        navigator.userAgent
      );

    if (e.key === 'Enter' && !isMobile && !e.nativeEvent.isComposing) {
      const enterToSubmit = useStore.getState().enterToSubmit;

      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        handleGenerate();
        resetTextAreaHeight();
      } else if (
        (enterToSubmit && !e.shiftKey) ||
        (!enterToSubmit && (e.ctrlKey || e.shiftKey))
      ) {
        if (sticky) {
          e.preventDefault();
          handleGenerate();
          resetTextAreaHeight();
        } else {
          handleSave();
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sticky]); // зависимости на функции ниже подменяем линтер отключением, чтобы не ломать мемоизацию

  // ——— files/images helpers ———

  const blobToBase64 = useCallback(async (blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }, []);

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const state = useStore.getState();
    const idx =
      state.currentChatIndex >= 0 &&
      state.chats &&
      state.currentChatIndex < state.chats.length
        ? state.currentChatIndex
        : 0;

    const chat = state.chats?.[idx];
    const detail = chat?.imageDetail ?? 'auto';

    const newImageURLs = Array.from(files).map((file: Blob) =>
      URL.createObjectURL(file)
    );

    const newImages = await Promise.all(
      newImageURLs.map(async (url) => {
        const blob = await fetch(url).then((r) => r.blob());
        const base64 = await blobToBase64(blob);
        return {
          type: 'image_url',
          image_url: {
            detail,
            url: base64,
          },
        } as ImageContentInterface;
      })
    );

    _setContent((prev) => [...prev, ...newImages]);
  }, [blobToBase64]);

  const handleImageUrlChange = useCallback(() => {
    if (imageUrl.trim() === '') return;

    const state = useStore.getState();
    const idx =
      state.currentChatIndex >= 0 &&
      state.chats &&
      state.currentChatIndex < state.chats.length
        ? state.currentChatIndex
        : 0;
    const chat = state.chats?.[idx];
    const detail = chat?.imageDetail ?? 'auto';

    const newImage: ImageContentInterface = {
      type: 'image_url',
      image_url: {
        detail,
        url: imageUrl.trim(),
      },
    };

    _setContent((prev) => [...prev, newImage]);
    setImageUrl('');
  }, [imageUrl]);

  const handleImageDetailChange = useCallback((index: number, detail: string) => {
    // index — это индекс по списку картинок, а в _content[0] — текст
    _setContent((prev) => {
      const next = [...prev];
      const i = index + 1;
      if (next[i]?.type === 'image_url') {
        const img = next[i] as ImageContentInterface;
        next[i] = {
          ...img,
          image_url: { ...img.image_url, detail },
        };
      }
      return next;
    });
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    _setContent((prev) => {
      const next = [...prev];
      next.splice(index + 1, 1);
      return next;
    });
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const state = useStore.getState();
    const idx =
      state.currentChatIndex >= 0 &&
      state.chats &&
      state.currentChatIndex < state.chats.length
        ? state.currentChatIndex
        : 0;
    const chat = state.chats?.[idx];
    const detail = chat?.imageDetail ?? 'auto';

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const base64Image = await blobToBase64(blob);
          const newImage: ImageContentInterface = {
            type: 'image_url',
            image_url: {
              detail,
              url: base64Image,
            },
          };
          _setContent((prev) => [...prev, newImage]);
        }
      }
    }
  }, [blobToBase64]);

  // ——— save / generate ———

  const { handleSubmit } = useSubmit();

  const applyChatsUpdate = useCallback(
    (updatedContent: ContentInterface[], mode: 'save' | 'generate') => {
      const state = useStore.getState();
      const originalChats = state.chats ?? [];
      if (originalChats.length === 0) {
        // если стора пуст, создадим хотя бы нулевой чат
        setCurrentChatIndex(0);
      }

      const idx =
        state.currentChatIndex >= 0 &&
        originalChats.length > 0 &&
        state.currentChatIndex < originalChats.length
          ? state.currentChatIndex
          : 0;

      const generating = state.generating;
      if (generating && mode === 'generate') return;

      // минимальные копии:
      const chatsShallow = originalChats.slice();
      const chat = chatsShallow[idx];
      if (!chat) return; // на всякий

      let newMessages = chat.messages;

      if (sticky) {
        // добавляем новое сообщение
        newMessages = [...chat.messages, { role: inputRole, content: updatedContent }];
      } else {
        // редактируем текущее сообщение
        newMessages = chat.messages.map((m, j) =>
          j === messageIndex ? { ...m, content: updatedContent } : m
        );

        if (mode === 'generate') {
          // обрезаем хвост истории после отредактированного
          newMessages = newMessages.slice(0, messageIndex + 1);
        }
      }

      const newChats: ChatInterface[] = chatsShallow;
      newChats[idx] = { ...chat, messages: newMessages };

      try {
        setChats(newChats);
      } catch (error: unknown) {
        const err = error as DOMException;
        if (err && err.name === 'QuotaExceededError') {
          // откат
          setChats(originalChats);

          toast.error(
            t('notifications.quotaExceeded', {
              ns: 'import',
            }),
            { autoClose: 15000 }
          );

          // пробуем сохранить только текст
          const textOnlyContent = updatedContent.filter(isTextContent);
          if (textOnlyContent.length > 0) {
            let fallbackMessages = chat.messages;

            if (sticky) {
              fallbackMessages = [
                ...chat.messages,
                { role: inputRole, content: textOnlyContent },
              ];
            } else {
              fallbackMessages = chat.messages.map((m, j) =>
                j === messageIndex ? { ...m, content: textOnlyContent } : m
              );
              if (mode === 'generate') {
                fallbackMessages = fallbackMessages.slice(0, messageIndex + 1);
              }
            }

            const fallbackChats = originalChats.slice();
            fallbackChats[idx] = { ...chat, messages: fallbackMessages };

            try {
              setChats(fallbackChats);
              toast.info(
                t('notifications.textSavedOnly', {
                  ns: 'import',
                }),
                { autoClose: 15000 }
              );
            } catch (innerError: unknown) {
              toast.error((innerError as Error).message);
            }
          }
        } else {
          toast.error((error as Error).message);
        }
      }
    },
    [inputRole, messageIndex, setChats, setCurrentChatIndex, sticky, t]
  );

  const handleSave = useCallback(() => {
    const text = textareaRef.current?.value ?? '';
    const updatedContent: ContentInterface[] = [
      { type: 'text', text },
      ..._content.slice(1),
    ];

    const hasTextContent = text !== '';
    const hasImageContent =
      Array.isArray(updatedContent) &&
      updatedContent.some((c) => c.type === 'image_url');

    if (sticky && (!hasTextContent && !hasImageContent)) {
      return;
    }

    applyChatsUpdate(updatedContent, 'save');

    if (sticky) {
      _setContent([{ type: 'text', text: '' } as TextContentInterface]);
      if (textareaRef.current) textareaRef.current.value = '';
      resetTextAreaHeight();
    } else {
      setIsEdit(false);
    }
  }, [_content, applyChatsUpdate, resetTextAreaHeight, setIsEdit, sticky]);

  const handleGenerate = useCallback(() => {
    const text = textareaRef.current?.value ?? '';
    const updatedContent: ContentInterface[] = [
      { type: 'text', text },
      ..._content.slice(1),
    ];

    const state = useStore.getState();
    if (state.generating) return;

    // выполняем минимальное обновление стора
    applyChatsUpdate(updatedContent, 'generate');

    if (sticky) {
      _setContent([{ type: 'text', text: '' } as TextContentInterface]);
      if (textareaRef.current) textareaRef.current.value = '';
      resetTextAreaHeight();
    } else {
      setIsEdit(false);
    }

    // отправляем запрос
    handleSubmit();
  }, [_content, applyChatsUpdate, handleSubmit, resetTextAreaHeight, setIsEdit, sticky]);

  useEffect(() => {
    // первичная подгонка высоты
    scheduleResize();
  }, [scheduleResize]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className='relative'>
      <div
        className={`w-full  ${
          sticky
            ? 'py-2 md:py-3 px-2 md:px-4 border border-black/10 bg-white dark:border-gray-900/50 dark:text-white dark:bg-gray-700 rounded-md shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]'
            : ''
        }`}
      >
        <div className='relative flex items-start'>
          {modelTypes[model] == 'image' && (
            <>
              <button
                className='absolute left-0 bottom-0  btn btn-secondary h-10 ml-[-1.2rem] mb-[-0.4rem]'
                onClick={handleUploadButtonClick}
                aria-label={'Upload Images'}
              >
                <div className='flex items-center justify-center gap-2'>
                  <AttachmentIcon />
                </div>
              </button>
            </>
          )}

          <textarea
            ref={textareaRef}
            className={`m-0 resize-none rounded-lg bg-transparent overflow-y-hidden focus:ring-0 focus-visible:ring-0 leading-7 w-full placeholder:text-gray-500/40 pr-10 ${
              modelTypes[model] == 'image' ? 'pl-7' : ''
            }`}
            defaultValue={(_content[0] as TextContentInterface).text}
            onInput={scheduleResize}
            placeholder={t('submitPlaceholder') as string}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
          />
        </div>
      </div>

      <EditViewButtons
        sticky={sticky}
        handleFileChange={handleFileChange}
        handleImageDetailChange={handleImageDetailChange}
        handleRemoveImage={handleRemoveImage}
        handleGenerate={handleGenerate}
        handleSave={handleSave}
        setIsModalOpen={setIsModalOpen}
        setIsEdit={setIsEdit}
        _setContent={_setContent}
        _content={_content}
        imageUrl={imageUrl}
        setImageUrl={setImageUrl}
        handleImageUrlChange={handleImageUrlChange}
        fileInputRef={fileInputRef}
        model={model}
        // tip: при очень длинных текстах можно временно скрывать токен-каунтер,
        // чтобы избежать тяжелых подсчетов: передайте, например, флаг и проверьте длину
      />

      {isModalOpen && (
        <PopupModal
          setIsModalOpen={setIsModalOpen}
          title={t('warning') as string}
          message={t('clearMessageWarning') as string}
          handleConfirm={handleGenerate}
        />
      )}
    </div>
  );
};

const EditViewButtons = memo(
  ({
    sticky = false,
    handleFileChange,
    handleImageDetailChange,
    handleRemoveImage,
    handleGenerate,
    handleSave,
    setIsModalOpen,
    setIsEdit,
    _setContent,
    _content,
    imageUrl,
    setImageUrl,
    handleImageUrlChange,
    fileInputRef,
    model,
  }: {
    sticky?: boolean;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleImageDetailChange: (index: number, e: string) => void;
    handleRemoveImage: (index: number) => void;
    handleGenerate: () => void;
    handleSave: () => void;
    setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    _setContent: React.Dispatch<React.SetStateAction<ContentInterface[]>>;
    _content: ContentInterface[];
    imageUrl: string;
    setImageUrl: React.Dispatch<React.SetStateAction<string>>;
    handleImageUrlChange: () => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    model: ModelOptions;
  }) => {
    const { t } = useTranslation();
    const generating = useStore.getState().generating;
    const advancedMode = useStore((state) => state.advancedMode);

    return (
      <div>
        {modelTypes[model] == 'image' && (
          <>
            <div className='flex justify-center'>
              <div className='flex gap-5'>
                {_content.slice(1).map((image, index) => (
                  <div
                    key={index}
                    className='image-container flex flex-col gap-2'
                  >
                    <img
                      src={image.image_url.url}
                      alt={`uploaded-${index}`}
                      className='h-10'
                    />
                    <div className='flex flex-row gap-3'>
                      <select
                        onChange={(event) =>
                          handleImageDetailChange(index, event.target.value)
                        }
                        title='Select image resolution'
                        aria-label='Select image resolution'
                        defaultValue={image.image_url.detail}
                        style={{ color: 'black' }}
                      >
                        <option value='auto'>Auto</option>
                        <option value='high'>High</option>
                        <option value='low'>Low</option>
                      </select>
                      <button
                        className='close-button'
                        onClick={() => handleRemoveImage(index)}
                        aria-label='Remove Image'
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className='flex justify-center mt-4'>
              <input
                type='text'
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('enter_image_url_placeholder') as string}
                className='input input-bordered w-full max-w-xs text-gray-800 dark:text-white p-3  border-none bg-gray-200 dark:bg-gray-600 rounded-md m-0 w-full mr-0 h-10 focus:outline-none'
              />
              <button
                className='btn btn-neutral ml-2'
                onClick={handleImageUrlChange}
                aria-label={t('add_image_url') as string}
              >
                {t('add_image_url')}
              </button>
            </div>
            {/* Hidden file input */}
            <input
              type='file'
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
              multiple
            />
          </>
        )}

        <div className='flex'>
          <div className='flex-1 text-center mt-2 flex justify-center'>
            {sticky && (
              <button
                className={`btn relative mr-2 btn-primary ${
                  generating ? 'cursor-not-allowed opacity-40' : ''
                }`}
                onClick={handleGenerate}
                aria-label={t('generate') as string}
                disabled={generating}
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('generate')}
                </div>
              </button>
            )}

            {sticky || (
              <button
                className='btn relative mr-2 btn-primary'
                onClick={() => {
                  !generating && setIsModalOpen(true);
                }}
                aria-label={t('generate') as string}
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('generate')}
                </div>
              </button>
            )}

            <button
              className={`btn relative mr-2 ${
                sticky
                  ? `btn-neutral ${
                      generating ? 'cursor-not-allowed opacity-40' : ''
                    }`
                  : 'btn-neutral'
              }`}
              onClick={handleSave}
              aria-label={t('save') as string}
              disabled={sticky && generating}
            >
              <div className='flex items-center justify-center gap-2'>
                {t('save')}
              </div>
            </button>

            {sticky || (
              <button
                className='btn relative btn-neutral'
                onClick={() => setIsEdit(false)}
                aria-label={t('cancel') as string}
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('cancel')}
                </div>
              </button>
            )}
          </div>
          {sticky && advancedMode && <TokenCount />}
          <CommandPrompt _setContent={_setContent} />
        </div>
      </div>
    );
  }
);

export default memo(EditView);