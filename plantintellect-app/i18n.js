import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

const resources = {
  en: {
    translation: {
      title: 'PlantIntellect',
      capture: 'Capture',
      gallery: 'Gallery',
      analyze: 'Analyze',
      species: 'Species',
      confidence: 'Confidence',
      suitableNow: 'Suitable Now',
      yes: 'Yes',
      no: 'No',
      permission_gallery: 'Permission required to access gallery',
      permission_camera: 'Camera permission denied',
      permission_location: 'Location permission denied',
      select_image_first: 'Please select or capture an image first',
      analyze_failed: 'Failed to analyze. Ensure backend is running.'
    }
  },
  ta: {
    translation: {
      title: 'பிளாந்த் இன்டெல்லெக்ட்',
      capture: 'புகைப்படம்',
      gallery: 'கேலரி',
      analyze: 'பகுப்பாய்வு',
      species: 'இனம்',
      confidence: 'நம்பிக்கை',
      suitableNow: 'இப்போது பொருத்தமா',
      yes: 'ஆம்',
      no: 'இல்லை',
      permission_gallery: 'கேலரி அனுமதி தேவை',
      permission_camera: 'கேமரா அனுமதி மறுக்கப்பட்டது',
      permission_location: 'இருப்பிடம் அனுமதி மறுக்கப்பட்டது',
      select_image_first: 'முதலில் ஒரு படத்தைத் தேர்வு செய்யவும்',
      analyze_failed: 'பகுப்பாய்வு தோல்வி. பின்புற சேவை இயங்குகிறதா?' 
    }
  }
};

// Robust locale detection for web/native
const deviceLanguageTag = (
  (Localization && Localization.locale) ||
  (Localization && typeof Localization.getLocales === 'function' && Localization.getLocales()[0]?.languageTag) ||
  'en'
);
const initialLng = String(deviceLanguageTag).toLowerCase().startsWith('ta') ? 'ta' : 'en';

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: initialLng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

export default i18n;


