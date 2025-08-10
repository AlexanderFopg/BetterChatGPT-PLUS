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

  // Main toggle for the feature
  const autoCheck = useStore((state) => state.autoCheck);
  const setAutoCheck = useStore((state) => state.setAutoCheck);

  // Toggle for streaming first LLM
  const streamFirstLLM = useStore((state) => state.streamFirstLLM);
  const setStreamFirstLLM = useStore((state) => state.setStreamFirstLLM);

  // Checker LLM configuration
  const checkerConfig = useStore((state) => state.checkerConfig);
  const setCheckerConfig = useStore((state) => state.setCheckerConfig);
  const checkerSystemMessage = useStore((state) => state.checkerSystemMessage);
  const setCheckerSystemMessage = useStore((state) => state.setCheckerSystemMessage);

  const [_checkerConfig, _setCheckerConfig] = useState<ConfigInterface>(checkerConfig);
  const [_checkerSystemMessage, _setCheckerSystemMessage] = useState<string>(checkerSystemMessage);

  useEffect(() => {
    setCheckerConfig(_checkerConfig);
  }, [_checkerConfig]);

  useEffect(() => {
    setCheckerSystemMessage(_checkerSystemMessage);
  }, [_checkerSystemMessage]);

  const handleReset = () => {
    _setCheckerConfig(_defaultCheckerConfig);
    _setCheckerSystemMessage(_defaultCheckerSystemMessage);
  };

  const handleConfigChange = (newConfig: Partial<ConfigInterface>) => {
    _setCheckerConfig((prev) => ({ ...prev, ...newConfig }));
  };

  return (
    <div className='flex flex-col gap-4 p-4 border rounded-md border-gray-300 dark:border-gray-600 w-full'>
      <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>{t('autoCheck.title', { ns: 'main', defaultValue: 'Auto-Check Response' })}</h2>
      <Toggle
        label={t('autoCheck.enable', { ns: 'main', defaultValue: 'Enable auto-check' })}
        isChecked={autoCheck}
        setIsChecked={setAutoCheck}
      />
      {autoCheck && (
        <div className='flex flex-col gap-4 pl-4 border-l-2 border-gray-300 dark:border-gray-500'>
          <Toggle
            label={t('autoCheck.streamFirst', { ns: 'main', defaultValue: 'Stream first LLM response' })}
            isChecked={streamFirstLLM}
            setIsChecked={setStreamFirstLLM}
          />
          <div className='flex flex-col gap-2'>
            <label className='block text-sm font-medium text-gray-900 dark:text-white'>
              {t('autoCheck.checkerPrompt', { ns: 'main', defaultValue: 'Checker Prompt' })}
            </label>
            <textarea
              className='my-2 mx-0 px-2 resize-none rounded-lg bg-gray-200 dark:bg-gray-800 overflow-y-auto leading-7 p-1 border border-gray-400/50 focus:ring-1 focus:ring-blue w-full'
              value={_checkerSystemMessage}
              onChange={(e) => _setCheckerSystemMessage(e.target.value)}
              rows={5}
            />
          </div>

          <ModelSelector
            _model={_checkerConfig.model}
            _setModel={(model) => handleConfigChange({ model: model as ModelOptions })}
            _label={t('autoCheck.checkerModel', { ns: 'model', defaultValue: 'Checker Model' })}
          />
          <MaxTokenSlider
            _maxToken={_checkerConfig.max_tokens}
            _setMaxToken={(max_tokens) => handleConfigChange({ max_tokens })}
            _model={_checkerConfig.model}
          />
          <TemperatureSlider
            _temperature={_checkerConfig.temperature}
            _setTemperature={(temperature) => handleConfigChange({ temperature })}
          />
          <TopPSlider
            _topP={_checkerConfig.top_p}
            _setTopP={(top_p) => handleConfigChange({ top_p })}
          />
          <PresencePenaltySlider
            _presencePenalty={_checkerConfig.presence_penalty}
            _setPresencePenalty={(presence_penalty) => handleConfigChange({ presence_penalty })}
          />
          <FrequencyPenaltySlider
            _frequencyPenalty={_checkerConfig.frequency_penalty}
            _setFrequencyPenalty={(frequency_penalty) => handleConfigChange({ frequency_penalty })}
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