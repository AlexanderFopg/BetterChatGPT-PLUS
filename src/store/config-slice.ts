import { StoreSlice } from './store';
import { Theme } from '@type/theme';
import {
  _defaultChatConfig,
  _defaultSystemMessage,
  _defaultMenuWidth,
  defaultModel,
  _defaultImageDetail,
  _defaultDisplayChatSize,
  _defaultCheckerConfig,         // New import
  _defaultCheckerSystemMessage  // New import
} from '@constants/chat';
import { ConfigInterface, ImageDetail, TotalTokenUsed } from '@type/chat';
import { ModelOptions } from '@utils/modelReader';

export interface ConfigSlice {
  openConfig: boolean;
  theme: Theme;
  autoTitle: boolean;
  titleModel: ModelOptions;
  hideMenuOptions: boolean;
  advancedMode: boolean;
  defaultChatConfig: ConfigInterface;
  defaultSystemMessage: string;
  hideSideMenu: boolean;
  enterToSubmit: boolean;
  inlineLatex: boolean;
  markdownMode: boolean;
  countTotalTokens: boolean;
  totalTokenUsed: TotalTokenUsed;
  menuWidth: number;
  displayChatSize: boolean;
  defaultImageDetail: ImageDetail;
  autoScroll: boolean;
  // ===========================================================================
  // NEW: State for auto-check feature
  // ===========================================================================
  autoCheck: boolean;
  streamFirstLLM: boolean;
  checkerConfig: ConfigInterface;
  checkerSystemMessage: string;
  // ===========================================================================
  setOpenConfig: (openConfig: boolean) => void;
  setTheme: (theme: Theme) => void;
  setAutoTitle: (autoTitle: boolean) => void;
  setTitleModel: (titleModel: ModelOptions) => void;
  setAdvancedMode: (advancedMode: boolean) => void;
  setDefaultChatConfig: (defaultChatConfig: ConfigInterface) => void;
  setDefaultSystemMessage: (defaultSystemMessage: string) => void;
  setHideMenuOptions: (hideMenuOptions: boolean) => void;
  setHideSideMenu: (hideSideMenu: boolean) => void;
  setEnterToSubmit: (enterToSubmit: boolean) => void;
  setInlineLatex: (inlineLatex: boolean) => void;
  setMarkdownMode: (markdownMode: boolean) => void;
  setCountTotalTokens: (countTotalTokens: boolean) => void;
  setTotalTokenUsed: (totalTokenUsed: TotalTokenUsed) => void;
  setMenuWidth: (menuWidth: number) => void;
  setDisplayChatSize: (displayChatSize: boolean) => void;
  setDefaultImageDetail: (imageDetail: ImageDetail) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  // ===========================================================================
  // NEW: Setters for auto-check feature
  // ===========================================================================
  setAutoCheck: (autoCheck: boolean) => void;
  setStreamFirstLLM: (streamFirstLLM: boolean) => void;
  setCheckerConfig: (checkerConfig: ConfigInterface) => void;
  setCheckerSystemMessage: (checkerSystemMessage: string) => void;
  // ===========================================================================
  setApiRequestBody: (body: string) => void;
}

export const createConfigSlice: StoreSlice<ConfigSlice> = (set, get) => ({
  openConfig: false,
  theme: 'dark',
  hideMenuOptions: false,
  hideSideMenu: false,
  autoTitle: false,
  titleModel: defaultModel,
  enterToSubmit: true,
  advancedMode: true,
  defaultChatConfig: _defaultChatConfig,
  defaultSystemMessage: _defaultSystemMessage,
  inlineLatex: false,
  markdownMode: true,
  countTotalTokens: false,
  totalTokenUsed: {},
  menuWidth: _defaultMenuWidth,
  displayChatSize: _defaultDisplayChatSize,
  defaultImageDetail: _defaultImageDetail,
  autoScroll: true,
  // ===========================================================================
  // NEW: Initial values for auto-check feature
  // ===========================================================================
  autoCheck: false,
  streamFirstLLM: false,
  checkerConfig: _defaultCheckerConfig,
  checkerSystemMessage: _defaultCheckerSystemMessage,
  // ===========================================================================
  apiRequestBody: '',
  setOpenConfig: (openConfig: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      openConfig: openConfig,
    }));
  },
  setTheme: (theme: Theme) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      theme: theme,
    }));
  },
  setAutoTitle: (autoTitle: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      autoTitle: autoTitle,
    }));
  },
  setTitleModel: (titleModel: ModelOptions) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      titleModel: titleModel,
    }));
  },
  setAdvancedMode: (advancedMode: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      advancedMode: advancedMode,
    }));
  },
  setDefaultChatConfig: (defaultChatConfig: ConfigInterface) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      defaultChatConfig: defaultChatConfig,
    }));
  },
  setDefaultSystemMessage: (defaultSystemMessage: string) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      defaultSystemMessage: defaultSystemMessage,
    }));
  },
  setHideMenuOptions: (hideMenuOptions: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      hideMenuOptions: hideMenuOptions,
    }));
  },
  setHideSideMenu: (hideSideMenu: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      hideSideMenu: hideSideMenu,
    }));
  },
  setEnterToSubmit: (enterToSubmit: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      enterToSubmit: enterToSubmit,
    }));
  },
  setInlineLatex: (inlineLatex: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      inlineLatex: inlineLatex,
    }));
  },
  setMarkdownMode: (markdownMode: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      markdownMode: markdownMode,
    }));
  },
  setCountTotalTokens: (countTotalTokens: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      countTotalTokens: countTotalTokens,
    }));
  },
  setTotalTokenUsed: (totalTokenUsed: TotalTokenUsed) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      totalTokenUsed: totalTokenUsed,
    }));
  },
  setMenuWidth: (menuWidth: number) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      menuWidth: menuWidth,
    }));
  },
  setDisplayChatSize: (displayChatSize: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      displayChatSize: displayChatSize,
    }));
  },
  setDefaultImageDetail: (imageDetail: ImageDetail) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      defaultImageDetail: imageDetail,
    }));
  },
  setAutoScroll: (autoScroll: boolean) => {
    set((prev: ConfigSlice) => ({
      ...prev,
      autoScroll: autoScroll,
    }));
  },
  // ===========================================================================
  // NEW: Setter implementations for auto-check feature
  // ===========================================================================
  setAutoCheck: (autoCheck: boolean) => {
    set((prev: ConfigSlice) => ({ ...prev, autoCheck }));
  },
  setStreamFirstLLM: (streamFirstLLM: boolean) => {
    set((prev: ConfigSlice) => ({ ...prev, streamFirstLLM }));
  },
  setCheckerConfig: (checkerConfig: ConfigInterface) => {
    set((prev: ConfigSlice) => ({ ...prev, checkerConfig }));
  },
  setCheckerSystemMessage: (checkerSystemMessage: string) => {
    set((prev: ConfigSlice) => ({ ...prev, checkerSystemMessage }));
  },
  setApiRequestBody: (body: string) => { // <-- И СЮДА
    set((prev: ConfigSlice) => ({
      ...prev,
      apiRequestBody: body,
    }));
  },
  // ===========================================================================
});