import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { ruTranslation } from './resources';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: {} },
      ru: { translation: ruTranslation },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'dzzenos_lang',
    },
    returnNull: false,
    returnEmptyString: false,
  });

export default i18n;
