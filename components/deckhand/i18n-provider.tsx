'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { translate, type Locale, type MessageKey } from '@/lib/i18n';

const LOCALE_KEY = 'deckhand.locale.v1';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    const preferred: Locale = saved === 'ja' || saved === 'en'
      ? saved
      : navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
    queueMicrotask(() => setLocale(preferred));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key) => translate(locale, key),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider.');
  return value;
}
