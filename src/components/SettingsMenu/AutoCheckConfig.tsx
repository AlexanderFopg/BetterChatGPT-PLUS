import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';
import { ConfigInterface } from '@type/chat';
import { ModelOptions } from '@utils/modelReader';
import {
  ModelSelector,
  TemperatureSlider,
  TopPSlider,
  PresencePenaltySlider,
  FrequencyPenaltySlider,
  MaxTokenSlider,
} from '@components/ConfigMenu/ConfigMenu';
import { _defaultCheckerConfig, _defaultCheckerSystemMessage } from '@constants/chat';

const AutoCheckConfig = () => {
  const { t } = useTranslation(['main', 'model']);

  // Получаем значения и сеттеры из глобального хранилища Zustand
  const {
    autoCheck,
    setAutoCheck,
    streamFirstLLM,
    setStreamFirstLLM,
    checkerConfig,
    setCheckerConfig,
    checkerSystemMessage,
    setCheckerSystemMessage,
  } = useStore(state => ({
    autoCheck: state.autoCheck,
    setAutoCheck: state.setAutoCheck,
    streamFirstLLM: state.streamFirstLLM,
    setStreamFirstLLM: state.setStreamFirstLLM,
    checkerConfig: state.checkerConfig,
    setCheckerConfig: state.setCheckerConfig,
    checkerSystemMessage: state.checkerSystemMessage,
    setCheckerSystemMessage: state.setCheckerSystemMessage,
  }));

  // Создаем локальное состояние для элементов формы, инициализируя его из Zustand
  const [isAutoCheckEnabled, setIsAutoCheckEnabled] = useState(autoCheck);
  const [isStreamFirstEnabled, setIsStreamFirstEnabled] = useState(streamFirstLLM);
  const [localCheckerConfig, setLocalCheckerConfig] = useState<ConfigInterface>(checkerConfig);
  const [localSystemMessage, setLocalSystemMessage] = useState<string>(checkerSystemMessage);

  // Используем useEffect для синхронизации локальных изменений обратно в Zustand
  useEffect(() => {
    setAutoCheck(isAutoCheckEnabled);
  }, [isAutoCheckEnabled, setAutoCheck]);

  useEffect(() => {
    setStreamFirstLLM(isStreamFirstEnabled);
  }, [isStreamFirstEnabled, setStreamFirstLLM]);

  useEffect(() => {
    setCheckerConfig(localCheckerConfig);
  }, [localCheckerConfig, setCheckerConfig]);

  useEffect(() => {
    setCheckerSystemMessage(localSystemMessage);
  }, [localSystemMessage, setCheckerSystemMessage]);

  const handleReset = () => {
    setLocalCheckerConfig(_defaultCheckerConfig);
    setLocalSystemMessage(_defaultCheckerSystemMessage);
  };
  
  return (
    <div className='flex flex-col gap-4 p-4 border rounded-md border-gray-300 dark:border-gray-600 w-full'>
      <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>{t('autoCheck.title', { ns: 'main', defaultValue: 'Auto-Check Response' })}</h2>
      <Toggle
        label={t('autoCheck.enable', { ns: 'main', defaultValue: 'Enable auto-check' })}
        isChecked={isAutoCheckEnabled}
        setIsChecked={setIsAutoCheckEnabled} // Теперь сюда передается сеттер от useState, что корректно
      />
      {isAutoCheckEnabled && (
        <div className='flex flex-col gap-4 pl-4 border-l-2 border-gray-300 dark:border-gray-500'>
          <Toggle
            label={t('autoCheck.streamFirst', { ns: 'main', defaultValue: 'Stream first LLM response' })}
            isChecked={isStreamFirstEnabled}
            setIsChecked={setIsStreamFirstEnabled} // И здесь тоже
          />
          <div className='flex flex-col gap-2'>
            <label className='block text-sm font-medium text-gray-900 dark:text-white'>
              {t('autoCheck.checkerPrompt', { ns: 'main', defaultValue: 'Checker Prompt' })}
            </label>
            <textarea
              className='my-2 mx-0 px-2 resize-none rounded-lg bg-gray-200 dark:bg-gray-800 overflow-y-auto leading-7 p-1 border border-gray-400/50 focus:ring-1 focus:ring-blue w-full'
              value={localSystemMessage}
              onChange={(e) => setLocalSystemMessage(e.target.value)}
              rows={5}
            />
          </div>

          <ModelSelector
            _model={localCheckerConfig.model}
            _setModel={(model) => setLocalCheckerConfig(prev => ({ ...prev, model: model as ModelOptions }))}
            _label={t('autoCheck.checkerModel', { ns: 'model', defaultValue: 'Checker Model' })}
          />
          <MaxTokenSlider
            _maxToken={localCheckerConfig.max_tokens}
            _setMaxToken={(max_tokens) => setLocalCheckerConfig(prev => ({ ...prev, max_tokens: Number(max_tokens) }))}
            _model={localCheckerConfig.model}
          />
          <TemperatureSlider
            _temperature={localCheckerConfig.temperature}
            _setTemperature={(temperature) => setLocalCheckerConfig(prev => ({ ...prev, temperature: Number(temperature) }))}
          />
          <TopPSlider
            _topP={localCheckerConfig.top_p}
            _setTopP={(top_p) => setLocalCheckerConfig(prev => ({ ...prev, top_p: Number(top_p) }))}
          />
          <PresencePenaltySlider
            _presencePenalty={localCheckerConfig.presence_penalty}
            _setPresencePenalty={(presence_penalty) => setLocalCheckerConfig(prev => ({ ...prev, presence_penalty: Number(presence_penalty) }))}
          />
          <FrequencyPenaltySlider
            _frequencyPenalty={localCheckerConfig.frequency_penalty}
            _setFrequencyPenalty={(frequency_penalty) => setLocalCheckerConfig(prev => ({ ...prev, frequency_penalty: Number(frequency_penalty) }))}
          />
          <button onClick={handleReset} className='btn btn-neutral self-start mt-2'>
            {t('resetToDefault', { ns: 'model' })}
          </button>
        </div>
      )}
    </div>
  );
};
export default AutoCheckConfig;
