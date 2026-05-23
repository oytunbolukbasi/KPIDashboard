import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { handleOAuthParams } from '@/lib/netmera-oauth';
import { setSecureItem } from '@/lib/secure-store-fallback';

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string; error_description?: string }>();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function processCallback() {
      const { code, state, error, error_description } = params;

      if (error) {
        const msg = `OAuth hatası: ${error}${error_description ? ' — ' + error_description : ''}`;
        setErrorMsg(msg);
        setStatus('error');
        setTimeout(() => router.replace('/(tabs)/settings'), 3000);
        return;
      }

      if (!code || !state) {
        setErrorMsg('OAuth callback parametreleri eksik (code veya state yok).');
        setStatus('error');
        setTimeout(() => router.replace('/(tabs)/settings'), 3000);
        return;
      }

      try {
        const token = await handleOAuthParams(code, state);
        await setSecureItem('netmera_mcp_token', token);
        // Navigate back to settings — token saved
        router.replace('/(tabs)/settings');
      } catch (e: any) {
        console.error('OAuth callback error:', e);
        setErrorMsg(e.message || String(e));
        setStatus('error');
        setTimeout(() => router.replace('/(tabs)/settings'), 3000);
      }
    }

    processCallback();
  }, []);

  return (
    <View style={styles.container}>
      {status === 'loading' ? (
        <>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.title}>Netmera ile bağlanıyor...</Text>
          <Text style={styles.subtitle}>Token alınıyor, lütfen bekleyin</Text>
        </>
      ) : (
        <>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.title}>Bağlantı hatası</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Text style={styles.subtitle}>Ayarlar ekranına dönülüyor...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 48,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
});
