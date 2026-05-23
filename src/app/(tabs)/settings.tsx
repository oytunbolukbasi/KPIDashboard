import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, Switch, Alert, TextInput, ActivityIndicator, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem, setSecureItem } from '@/lib/secure-store-fallback';
import { useThemeContext } from '@/context/theme-context';
import { useKPI } from '@/context/kpi-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollToTopListener } from '@/context/scroll-to-top-context';
import { startNetmeraOAuth, handleOAuthCallback } from '@/lib/netmera-oauth';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { isDark, toggleTheme, colors } = useThemeContext();
  const { deleteAll } = useKPI();
  const insets = useSafeAreaInsets();

  const [geminiKey, setGeminiKey] = useState('');
  const [netmeraToken, setNetmeraToken] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Handle deep-link callback from Netmera OAuth
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url.startsWith('kpidashboard://oauth/callback')) return;
      try {
        const token = await handleOAuthCallback(url);
        setNetmeraToken(token);
        await setSecureItem('netmera_mcp_token', token);
        setIsLoggingIn(false);
        Alert.alert(t('settings.keysSavedTitle'), t('settings.netmeraLoginSuccess'));
      } catch (e: any) {
        setIsLoggingIn(false);
        Alert.alert('OAuth Error', e.message || String(e));
      }
    };

    // Handle URLs when app is already open
    const subscription = Linking.addEventListener('url', handleUrl);

    // Handle URL that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, []);

  const handleNetmeraLogin = async () => {
    setIsLoggingIn(true);
    try {
      await startNetmeraOAuth();
      // Browser is now open — the Linking listener above will handle the callback
    } catch (e: any) {
      setIsLoggingIn(false);
      console.error(e);
      Alert.alert('Error', `${t('settings.netmeraLoginFail')}\n\nDetay: ${e.message || e}`);
    }
  };

  useEffect(() => {
    async function loadKeys() {
      try {
        const gKey = await getSecureItem('gemini_api_key');
        const nTok = await getSecureItem('netmera_mcp_token');
        if (gKey) setGeminiKey(gKey);
        if (nTok) setNetmeraToken(nTok);
      } catch (e) {
        console.error('Failed to load keys:', e);
      }
    }
    loadKeys();
  }, []);

  const handleSaveKeys = async () => {
    try {
      await setSecureItem('gemini_api_key', geminiKey);
      await setSecureItem('netmera_mcp_token', netmeraToken);
      Alert.alert(t('settings.keysSavedTitle'), t('settings.keysSavedMsg'));
    } catch (e) {
      Alert.alert('Error', t('settings.keysSaveError'));
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);
  useScrollToTopListener('settings', scrollToTop);


  const handleLanguageChange = () => {
    const nextLng = i18n.language === 'tr' ? 'en' : 'tr';
    i18n.changeLanguage(nextLng);
  };

  const handleResetSplash = async () => {
    await AsyncStorage.removeItem('@has_seen_splash');
    router.replace('/splash');
  };

  const handleDeleteAll = () => {
    Alert.alert(
      t('settings.deleteAllData'),
      t('settings.deleteAllConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.confirm'), style: 'destructive', onPress: () => deleteAll() },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.header, { color: colors.text }]}>{t('settings.title')}</Text>

        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t('settings.appearance')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={[styles.item, { borderBottomColor: colors.border }]} onPress={handleLanguageChange}>
            <Text style={[styles.itemLabel, { color: colors.text }]}>{t('settings.language')}</Text>
            <View style={[styles.langBadge, { backgroundColor: colors.accentLight }]}>
              <Text style={[styles.langText, { color: colors.accent }]}>{i18n.language.toUpperCase()}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.item}>
            <Text style={[styles.itemLabel, { color: colors.text }]}>{t('settings.darkMode')}</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* AI Agent Settings */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t('settings.aiAgent')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <View style={[styles.inputItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>{t('settings.geminiKey')}</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={geminiKey}
              onChangeText={setGeminiKey}
              placeholder="AIzaSy..."
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Netmera Login — OAuth 2.0 + PKCE */}
          <View style={[styles.inputItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.text, fontWeight: '700' }]}>Netmera MCP Bağlantısı</Text>
            <Text style={[styles.guideText, { color: colors.textTertiary }]}>
              Aşağıdaki butona tıklayın. Netmera giriş sayfası açılacak, oradan giriş yapın — uygulama otomatik olarak token'ı alacak.
            </Text>
            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: isLoggingIn ? colors.textTertiary : colors.accent }]}
              onPress={handleNetmeraLogin}
              disabled={isLoggingIn}
              activeOpacity={0.8}
            >
              {isLoggingIn ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.saveButtonText}>Tarayıcıda giriş bekleniyor...</Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>🔐 Netmera ile Giriş Yap</Text>
              )}
            </TouchableOpacity>
            {netmeraToken ? (
              <Text style={[styles.guideText, { color: '#22c55e', marginTop: 8 }]}>✅ Bağlı — Token mevcut</Text>
            ) : null}
          </View>

          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textTertiary }]}>{t('settings.or')}</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Direct Token Entry */}
          <View style={[styles.inputItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>{t('settings.netmeraToken')}</Text>
            <Text style={[styles.guideText, { color: colors.textTertiary }]}>
              {t('settings.netmeraTokenGuide')}
            </Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={netmeraToken}
              onChangeText={setNetmeraToken}
              placeholder="eyJhbG..."
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, { backgroundColor: colors.accent }]} 
            onPress={handleSaveKeys}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>{t('settings.save')}</Text>
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionLabel, { color: colors.red }]}>{t('settings.dangerZone')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={[styles.item, { borderBottomColor: colors.border }]} onPress={handleResetSplash}>
            <Text style={[styles.itemLabel, { color: colors.text }]}>{t('settings.resetOnboarding')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.item} onPress={handleDeleteAll}>
            <Text style={[styles.itemLabel, { color: colors.red }]}>{t('settings.deleteAllData')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },
  header: { fontSize: 24, fontWeight: '800', marginTop: 16, marginBottom: 28 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 28,
  },
  item: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  itemLabel: { fontSize: 16, fontWeight: '600' },
  langBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  langText: { fontSize: 13, fontWeight: '800' },
  inputItem: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  saveButton: {
    margin: 20,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButton: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  ssoText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 16,
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  panelButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelButton: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  guideText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
});
