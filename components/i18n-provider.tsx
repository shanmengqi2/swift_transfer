"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  detectPreferredLanguage,
  isLanguage,
  languageHtmlLang,
  translate,
  type Language,
  type TranslationKey,
} from "@/lib/i18n";

const LANGUAGE_STORAGE_KEY = "swift-transfer-language";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (
    key: TranslationKey,
    params?: Record<string, string | number>,
  ) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const nextLanguage = isLanguage(storedLanguage)
        ? storedLanguage
        : detectPreferredLanguage(navigator.languages);

      setLanguageState(nextLanguage);
      document.documentElement.lang = languageHtmlLang[nextLanguage];
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = languageHtmlLang[nextLanguage];
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used within LanguageProvider");
  }

  return value;
}
