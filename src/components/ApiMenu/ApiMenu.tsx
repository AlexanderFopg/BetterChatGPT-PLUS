import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import useStore from '@store/store';
import useHideOnOutsideClick from '@hooks/useHideOnOutsideClick';
import PopupModal from '@components/PopupModal';
import { availableEndpoints, defaultAPIEndpoint } from '@constants/auth';
import DownChevronArrow from '@icon/DownChevronArrow';
import CrossIcon from '@icon/CrossIcon';

const maskApiKey = (key: string) => {
  if (key.length <= 8) return '****************';
  return `${key.slice(0, 4)}*************************${key.slice(-4)}`;
};

const ApiMenu = ({
  setIsModalOpen,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { t } = useTranslation(['main', 'api']);

  const {
    apiKeys,
    activeApiKeyIndex,
    apiEndpoint,
    apiVersion,
    addApiKey,
    removeApiKey,
    setActiveApiKeyIndex,
    setApiEndpoint,
    setApiVersion,
  } = useStore();

  const [_apiEndpoint, _setApiEndpoint] = useState<string>(apiEndpoint);
  const [_apiVersion, _setApiVersion] = useState<string>(apiVersion || '');
  const [_customEndpoint, _setCustomEndpoint] = useState<boolean>(
    !availableEndpoints.includes(apiEndpoint)
  );
  const [newApiKey, setNewApiKey] = useState('');

  const handleAddKey = () => {
    if (newApiKey.trim()) {
      addApiKey(newApiKey.trim());
      setNewApiKey('');
    }
  };

  const handleSave = () => {
    setApiEndpoint(_apiEndpoint);
    setApiVersion(_apiVersion);
    setIsModalOpen(false);
  };

  const handleToggleCustomEndpoint = () => {
    if (_customEndpoint) _setApiEndpoint(defaultAPIEndpoint);
    else _setApiEndpoint('');
    _setCustomEndpoint((prev) => !prev);
  };

  return (
    <PopupModal
      title={t('api') as string}
      setIsModalOpen={setIsModalOpen}
      handleConfirm={handleSave}
    >
      <>
        {/* Секция выбора эндпоинта */}
        <div className='p-6 border-b border-gray-200 dark:border-gray-600'>
          <label className='flex gap-2 text-gray-900 dark:text-gray-300 text-sm items-center mb-4'>
            <input
              type='checkbox'
              checked={_customEndpoint}
              className='w-4 h-4'
              onChange={handleToggleCustomEndpoint}
            />
            {t('customEndpoint', { ns: 'api' })}
          </label>
          <div className='flex gap-2 items-center mb-6'>
            <div className='min-w-fit text-gray-900 dark:text-gray-300 text-sm'>
              {t('apiEndpoint.inputLabel', { ns: 'api' })}
            </div>
            {_customEndpoint ? (
              <input
                type='text'
                className='text-gray-800 dark:text-white p-3 text-sm border-none bg-gray-200 dark:bg-gray-600 rounded-md m-0 w-full mr-0 h-8 focus:outline-none'
                value={_apiEndpoint}
                onChange={(e) => _setApiEndpoint(e.target.value)}
              />
            ) : (
              <ApiEndpointSelector
                _apiEndpoint={_apiEndpoint}
                _setApiEndpoint={_setApiEndpoint}
              />
            )}
          </div>
        </div>

        {/* Новая секция управления API ключами */}
        <div className='p-6 border-b border-gray-200 dark:border-gray-600'>
          <h3 className='text-lg font-semibold mb-4 text-gray-900 dark:text-white'>
            {t('apiKey.manageTitle', { ns: 'api', defaultValue: 'Manage API Keys' })}
          </h3>
          <div className='flex items-center gap-2 mb-4'>
            <input
              type='password'
              className='flex-grow text-gray-800 dark:text-white p-3 text-sm border-none bg-gray-200 dark:bg-gray-600 rounded-md m-0 h-8 focus:outline-none'
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder={t('apiKey.addPlaceholder', { ns: 'api', defaultValue: 'Enter new API key' }) as string}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
            />
            <button onClick={handleAddKey} className='btn btn-primary btn-small'>
              {t('add', { ns: 'api', defaultValue: 'Add' })}
            </button>
          </div>
          <div className='space-y-2 max-h-48 overflow-y-auto pr-2'>
            {apiKeys.length > 0 ? (
              apiKeys.map((key, index) => (
                <div key={index} className='flex items-center gap-3 p-2 rounded-md bg-gray-100 dark:bg-gray-700/50'>
                  <input
                    type='radio'
                    id={`key-radio-${index}`}
                    name='activeApiKey'
                    checked={index === activeApiKeyIndex}
                    onChange={() => setActiveApiKeyIndex(index)}
                    className='form-radio h-4 w-4 text-blue-500 bg-gray-700 border-gray-500 focus:ring-blue-600'
                  />
                  <label htmlFor={`key-radio-${index}`} className='flex-1 cursor-pointer font-mono text-sm text-gray-700 dark:text-gray-300'>
                    {maskApiKey(key)}
                    {index === activeApiKeyIndex && (
                      <span className='ml-3 text-xs font-bold text-green-500 dark:text-green-400'>
                        ({t('apiKey.active', { ns: 'api', defaultValue: 'Active' })})
                      </span>
                    )}
                  </label>
                  <button
                    onClick={() => removeApiKey(index)}
                    className='p-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400'
                    aria-label='Remove Key'
                  >
                    <CrossIcon />
                  </button>
                </div>
              ))
            ) : (
              <p className='text-gray-500 dark:text-gray-400 text-sm text-center py-4'>
                {t('apiKey.noKeys', { ns: 'api', defaultValue: 'No API keys have been added.' })}
              </p>
            )}
          </div>
        </div>

        {/* Секция с API Version и информационными сообщениями */}
        <div className='p-6'>
          <div className='flex gap-2 items-center justify-center'>
            <div className='min-w-fit text-gray-900 dark:text-gray-300 text-sm'>
              {t('apiVersion.inputLabel', { ns: 'api' })}
            </div>
            <input
              type='text'
              placeholder={t('apiVersion.description', { ns: 'api' }) ?? ''}
              className='text-gray-800 dark:text-white p-3 text-sm border-none bg-gray-200 dark:bg-gray-600 rounded-md m-0 w-full mr-0 h-8 focus:outline-none'
              value={_apiVersion}
              onChange={(e) => _setApiVersion(e.target.value)}
            />
          </div>
          <div className='min-w-fit text-gray-900 dark:text-gray-300 text-sm flex flex-col gap-3 leading-relaxed mt-4'>
            <p>
              <Trans
                i18nKey='apiKey.howTo'
                ns='api'
                components={[<a href='https://platform.openai.com/account/api-keys' className='link' target='_blank'/>]}
              />
            </p>
            <p>{t('securityMessage', { ns: 'api' })}</p>
          </div>
        </div>
      </>
    </PopupModal>
  );
};

// Компонент ApiEndpointSelector можно оставить без изменений
const ApiEndpointSelector = ({ _apiEndpoint, _setApiEndpoint }: { _apiEndpoint: string; _setApiEndpoint: React.Dispatch<React.SetStateAction<string>>; }) => {
    const [dropDown, setDropDown, dropDownRef] = useHideOnOutsideClick();
    return (
        <div className='w-full relative flex-1'>
            <button
                className='btn btn-neutral btn-small flex justify-between w-full'
                type='button'
                aria-label='expand api menu'
                onClick={() => setDropDown((prev) => !prev)}
            >
                <span className='truncate'>{_apiEndpoint}</span>
                <DownChevronArrow />
            </button>
            <div
                id='dropdown'
                ref={dropDownRef}
                className={`${
                    dropDown ? '' : 'hidden'
                } absolute top-full mt-1 z-10 bg-white rounded-lg shadow-xl border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group dark:bg-gray-800 opacity-90 w-full`}
            >
                <ul
                    className='text-sm text-gray-700 dark:text-gray-200 p-0 m-0'
                    aria-labelledby='dropdownDefaultButton'
                >
                    {availableEndpoints.map((endpoint) => (
                        <li
                            className='px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white cursor-pointer truncate'
                            onClick={() => {
                                _setApiEndpoint(endpoint);
                                setDropDown(false);
                            }}
                            key={endpoint}
                        >
                            {endpoint}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ApiMenu;