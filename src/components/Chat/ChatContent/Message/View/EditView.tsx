import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
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

type EditViewProps = {
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  sticky?: boolean;
};

const MAX_AUTO_HEIGHT_VH = 50; // ограничим авто-рост до 50vh, дальше — скролл
const LARGE_TEXT_THRESHOLD = 20000; // при очень длинном тексте авто-ресайз отключаем

const EditView = ({
  content,
  setIsEdit,
  messageIndex,
  sticky,
}: EditViewProps) => {
  const { t } = useTranslation();

  // Store/selectors
  const setCurrentChatIndex = useStore((s) => s.setCurrentChatIndex);
  const inputRole = useStore((s) => s.inputRole);
  const setChats = useStore((s) => s.setChats);
  const chats = useStore((s) => s.chats);
  const generating = useStore((s) => s.generating);
  const advancedMode = useStore((s) => s.advancedMode);
  const enterToSubmit = useStore((s) => s.enterToSubmit);
  const currentChatIndex = useStore((s) => s.currentChatIndex);

  useEffect(() => {
    const isInitialised =
      chats && chats.length > 0 && currentChatIndex >= 0 && currentChatIndex < chats.length;
    if (!isInitialised) setCurrentChatIndex(0);
  }, [chats, currentChatIndex, setCurrentChatIndex]);

  const model = useStore((state) => {
    const isInitialised =
      state.chats &&
      state.chats.length > 0 &&
      state.currentChatIndex >= 0 &&
      state.currentChatIndex < state.chats.length;
    return isInitialised
      ? state.chats![state.currentChatIndex].config.model
      : defaultModel;
  });

  // Разбор входного контента
  const initialText = useMemo(() => {
    const firstText = content.find((c) => c.type === 'text') as TextContentInterface | undefined;
    return firstText?.text ?? '';
  }, [content]);

  const initialImages = useMemo(
    () => content.filter((c) => c.type === 'image_url') as ImageContentInterface[],
    [content]
  );

  // Текст — через ref (без перерисовок)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef<string>(initialText);

  // Картинки — отдельный стейт (для предпросмотра)
  const [images, setImages] = useState<ImageContentInterface[]>(initialImages);

  // Для модалки
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // image URL field
  const [imageUrl, setImageUrl] = useState<string>('');

  // Файл-инпут
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // rAF-троттлинг авто-ресайза
  const rafId = useRef<number | null>(null);
  const scheduleResize = useCallback(() => {
    if (!textareaRef.current) return;

    // Отключаем авто-ресайз для очень длинного текста
    if (textRef.current.length > LARGE_TEXT_THRESHOLD) {
      const el = textareaRef.current;
      const maxH = Math.floor((window.innerHeight * MAX_AUTO_HEIGHT_VH) / 100);
      el.style.height = `${maxH}px`;
      el.style.overflowY = 'auto';
      return;
    }

    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = textareaRef.current!;
      const maxH = Math.floor((window.innerHeight * MAX_AUTO_HEIGHT_VH) / 100);
      el.style.height = 'auto';
      const needed = Math.min(el.scrollHeight, maxH);
      el.style.height = `${needed}px`;
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    });
  }, []);

  useEffect(() => {
    // первичная подгонка
    scheduleResize();
    // cleanup rAF
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [scheduleResize]);

  const resetTextAreaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflowY = 'hidden';
  };

  const handleInput = () => {
    textRef.current = textareaRef.current?.value ?? '';
    scheduleResize();
  };

  const isMobile = useMemo(
    () =>
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|playbook|silk/i.test(
        navigator.userAgent
      ),
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || isMobile || e.nativeEvent.isComposing) return;

    if (e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      handleGenerate();
      resetTextAreaHeight();
      return;
    }
    const ets = enterToSubmit;
    if ((ets && !e.shiftKey) || (!ets && (e.ctrlKey || e.shiftKey))) {
      if (sticky) {
        e.preventDefault();
        handleGenerate();
        resetTextAreaHeight();
      } else {
        handleSave();
      }
    }
  };

  // Blob -> base64
  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

  // Файлы (сразу FileReader, без fetch(objectUrl))
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const chat = (useStore.getState().chats || [])[useStore.getState().currentChatIndex];
      const detail = chat?.imageDetail || 'auto';

      const base64s = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('FileReader error'));
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            })
        )
      );

      const newImages: ImageContentInterface[] = base64s.map((b64) => ({
        type: 'image_url',
        image_url: { detail, url: b64 },
      }));

      setImages((prev) => [...prev, ...newImages]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUrlChange = () => {
    if (imageUrl.trim() === '') return;

    const chat = (useStore.getState().chats || [])[useStore.getState().currentChatIndex];
    const detail = chat?.imageDetail || 'auto';

    const newImage: ImageContentInterface = {
      type: 'image_url',
      image_url: { detail, url: imageUrl.trim() },
    };
    setImages((prev) => [...prev, newImage]);
    setImageUrl('');
  };

  const handleImageDetailChange = (index: number, detail: string) => {
    setImages((prev) => {
      const next = prev.slice();
      next[index] = {
        ...next[index],
        image_url: { ...next[index].image_url, detail },
      };
      return next;
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const next = prev.slice();
      next.splice(index, 1);
      return next;
    });
  };

  const isTextContent = (c: ContentInterface): c is TextContentInterface => c.type === 'text';

  const buildUpdatedContent = (): ContentInterface[] => {
    const text = textRef.current ?? '';
    const textPart: TextContentInterface = { type: 'text', text };
    // создаём "чистые" копии image_url (на случай дальнейших мутаций)
    const imageParts = images.map<ImageContentInterface>((img) => ({
      type: 'image_url',
      image_url: { ...img.image_url },
    }));
    return [textPart, ...imageParts];
  };

  // Точечное обновление чатов (без глубоких JSON-клонов)
  const applyChatsUpdate = (
    updater: (draftChats: ChatInterface[], currIdx: number) => void,
    updatedContent: ContentInterface[]
  ) => {
    const original = useStore.getState().chats || [];
    const currIdx =
      useStore.getState().currentChatIndex >= 0
        ? useStore.getState().currentChatIndex
        : 0;

    const updatedChats = original.slice();
    const current = original[currIdx];
    if (!current) return;

    const messagesClone = current.messages ? current.messages.slice() : [];
    const chatClone: ChatInterface = {
      ...current,
      messages: messagesClone,
    };
    updatedChats[currIdx] = chatClone;

    try {
      updater(updatedChats, currIdx);
      setChats(updatedChats);
    } catch (error: unknown) {
      if ((error as DOMException).name === 'QuotaExceededError') {
        // откатим
        setChats(original);
        toast.error(
          t('notifications.quotaExceeded', { ns: 'import' }) as string,
          { autoClose: 15000 }
        );
        // попробовать сохранить только текст
        const textOnly = updatedContent.filter(isTextContent);
        if (textOnly.length > 0) {
          try {
            const updatedChatsFallback = original.slice();
            const currentFallback = original[currIdx];
            const messagesFallback = currentFallback.messages
              ? currentFallback.messages.slice()
              : [];
            const chatFallback: ChatInterface = {
              ...currentFallback,
              messages: messagesFallback,
            };
            updatedChatsFallback[currIdx] = chatFallback;
            // перезапишем только контент целевого сообщения
            if (sticky) {
              chatFallback.messages.push({ role: inputRole, content: textOnly });
            } else {
              messagesFallback[messageIndex].content = textOnly;
            }
            setChats(updatedChatsFallback);
            toast.info(
              t('notifications.textSavedOnly', { ns: 'import' }) as string,
              { autoClose: 15000 }
            );
          } catch (innerError) {
            toast.error((innerError as Error).message);
          }
        }
      } else {
        toast.error((error as Error).message);
      }
    }
  };

  const clearInput = () => {
    textRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      resetTextAreaHeight();
    }
    setImages([]);
  };

  const { handleSubmit } = useSubmit();

  const handleSave = () => {
    const updatedContent = buildUpdatedContent();
    const text = textRef.current ?? '';
    const hasText = text.trim().length > 0;
    const hasImages = images.length > 0;

    if (sticky && ((!hasText && !hasImages) || generating)) return;

    applyChatsUpdate((draft, idx) => {
      const msgs = draft[idx].messages;
      if (sticky) {
        msgs.push({ role: inputRole, content: updatedContent });
        clearInput();
      } else {
        msgs[messageIndex].content = updatedContent;
        setIsEdit(false);
      }
    }, updatedContent);
  };

  const handleGenerate = () => {
    if (generating) return;

    const updatedContent = buildUpdatedContent();
    const text = textRef.current ?? '';
    const hasText = text.trim().length > 0;
    const hasImages = images.length > 0;

    applyChatsUpdate((draft, idx) => {
      const msgs = draft[idx].messages;
      if (sticky) {
        if (hasText || hasImages) {
          msgs.push({ role: inputRole, content: updatedContent });
        }
        clearInput();
      } else {
        msgs[messageIndex].content = updatedContent;
        draft[idx].messages = msgs.slice(0, messageIndex + 1);
        setIsEdit(false);
      }
    }, updatedContent);

    handleSubmit();
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const items = Array.from(e.clipboardData.items);
      if (items.length === 0) return;

      const chat = (useStore.getState().chats || [])[useStore.getState().currentChatIndex];
      const detail = chat?.imageDetail || 'auto';

      const blobs: Blob[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) blobs.push(file);
        }
      }
      if (blobs.length === 0) return;

      const base64s = await Promise.all(blobs.map((b) => blobToBase64(b)));
      const newImages: ImageContentInterface[] = base64s.map((b64) => ({
        type: 'image_url',
        image_url: { detail, url: b64 },
      }));
      setImages((prev) => [...prev, ...newImages]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Адаптер совместимости для CommandPrompt: имитируем _setContent
  const setContentCompat = useCallback(
    (next: React.SetStateAction<ContentInterface[]>) => {
      const getCurrent = (): ContentInterface[] => [
        { type: 'text', text: textRef.current ?? '' },
        ...images,
      ];
      const resolved =
        typeof next === 'function' ? (next as (prev: ContentInterface[]) => ContentInterface[])(getCurrent()) : next;

      const nextText = (resolved.find((c) => c.type === 'text') as TextContentInterface | undefined)?.text ?? '';
      const nextImages = resolved.filter((c) => c.type === 'image_url') as ImageContentInterface[];

      textRef.current = nextText;
      // визуально обновим textarea, так как defaultValue не обновляется автоматически
      if (textareaRef.current) {
        textareaRef.current.value = nextText;
        scheduleResize();
      }
      setImages(nextImages);
    },
    [images, scheduleResize]
  );

  return (
    <div className='relative'>
      <div
        className={`w-full ${
          sticky
            ? 'py-2 md:py-3 px-2 md:px-4 border border-black/10 bg-white dark:border-gray-900/50 dark:text-white dark:bg-gray-700 rounded-md shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]'
            : ''
        }`}
      >
        <div className='relative flex items-start'>
          {modelTypes[model] === 'image' && (
            <button
              className='absolute left-0 bottom-0 btn btn-secondary h-10 ml-[-1.2rem] mb-[-0.4rem]'
              onClick={handleUploadButtonClick}
              aria-label={'Upload Images'}
            >
              <div className='flex items-center justify-center gap-2'>
                <AttachmentIcon />
              </div>
            </button>
          )}

          <textarea
            ref={textareaRef}
            className={`m-0 resize-none rounded-lg bg-transparent overflow-y-hidden focus:ring-0 focus-visible:ring-0 leading-7 w-full placeholder:text-gray-500/40 pr-10 ${
              modelTypes[model] === 'image' ? 'pl-7' : ''
            }`}
            defaultValue={initialText}
            placeholder={t('submitPlaceholder') as string}
            onInput={handleInput}
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
        _setContent={setContentCompat}
        images={images}
        imageUrl={imageUrl}
        setImageUrl={setImageUrl}
        handleImageUrlChange={handleImageUrlChange}
        fileInputRef={fileInputRef}
        model={model}
        generating={generating}
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
    _setContent, // совместимость с CommandPrompt
    images,
    imageUrl,
    setImageUrl,
    handleImageUrlChange,
    fileInputRef,
    model,
    generating,
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
    images: ImageContentInterface[];
    imageUrl: string;
    setImageUrl: React.Dispatch<React.SetStateAction<string>>;
    handleImageUrlChange: () => void;
    fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
    model: ModelOptions;
    generating: boolean;
  }) => {
    const { t } = useTranslation();
    const advancedMode = useStore((state) => state.advancedMode);

    return (
      <div>
        {modelTypes[model] === 'image' && (
          <>
            <div className='flex justify-center'>
              <div className='flex gap-5'>
                {images.map((image, index) => (
                  <div key={index} className='image-container flex flex-col gap-2'>
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
                className='input input-bordered w-full max-w-xs text-gray-800 dark:text-white p-3 border-none bg-gray-200 dark:bg-gray-600 rounded-md m-0 w-full mr-0 h-10 focus:outline-none'
              />
              <button
                className='btn btn-neutral ml-2'
                onClick={handleImageUrlChange}
                aria-label={t('add_image_url') as string}
              >
                {t('add_image_url')}
              </button>
            </div>
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
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('generate')}
                </div>
              </button>
            )}

            {!sticky && (
              <button
                className='btn relative mr-2 btn-primary'
                onClick={() => {
                  if (!generating) setIsModalOpen(true);
                }}
              >
                <div className='flex items-center justify-center gap-2'>
                  {t('generate')}
                </div>
              </button>
            )}

            <button
              className={`btn relative mr-2 ${
                sticky
                  ? `btn-neutral ${generating ? 'cursor-not-allowed opacity-40' : ''}`
                  : 'btn-neutral'
              }`}
              onClick={handleSave}
              aria-label={t('save') as string}
            >
              <div className='flex items-center justify-center gap-2'>
                {t('save')}
              </div>
            </button>

            {!sticky && (
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

export default EditView;