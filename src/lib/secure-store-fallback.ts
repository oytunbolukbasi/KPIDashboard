import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Storage } from './storage';

export async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return Storage.getItem(key);
  }
  try {
    const isAvailable = await SecureStore.isAvailableAsync();
    if (isAvailable) {
      return await SecureStore.getItemAsync(key);
    }
  } catch (e) {
    console.warn('SecureStore fallback get error:', e);
  }
  return Storage.getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    Storage.setItem(key, value);
    return;
  }
  try {
    const isAvailable = await SecureStore.isAvailableAsync();
    if (isAvailable) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
  } catch (e) {
    console.warn('SecureStore fallback set error:', e);
  }
  Storage.setItem(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
    return;
  }
  try {
    const isAvailable = await SecureStore.isAvailableAsync();
    if (isAvailable) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
  } catch (e) {
    console.warn('SecureStore fallback delete error:', e);
  }
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(key);
  }
}
