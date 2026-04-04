import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from '../locales/en.json';
import tr from '../locales/tr.json';

const resources = {
  en: { translation: en },
  tr: { translation: tr },
};

const getLocale = () => {
  const locale = Localization.getLocales()[0].languageCode;
  return locale === 'tr' ? 'tr' : 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getLocale(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
