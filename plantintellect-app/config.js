import { Platform } from 'react-native';

// Allow override via Expo env: set EXPO_PUBLIC_API_URL
const envUrl = process.env.EXPO_PUBLIC_API_URL;

// Android emulator maps host machine to 10.0.2.2
const defaultUrl = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000'
});

export const API_BASE_URL = envUrl || defaultUrl;


