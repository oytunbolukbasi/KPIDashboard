import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem, setSecureItem } from '@/lib/secure-store-fallback';
import { useThemeContext } from '@/context/theme-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollToTopListener } from '@/context/scroll-to-top-context';
import { startNetmeraOAuth, handleOAuthCallback } from '@/lib/netmera-oauth';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { isDark, toggleTheme, colors } = useThemeContext();
  const insets = useSafeAreaInsets();

  const [isConnected, setIsConnected] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [geminiKey, setGeminiKey] = useState('');
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [claudeKey, setClaudeKey] = useState('');
  const [claudeSaved, setClaudeSaved] = useState(false);

  useEffect(() => {
    getSecureItem('netmera_mcp_token')
      .then((tok) => setIsConnected(!!tok))
      .catch(() => {});
    getSecureItem('gemini_api_key').then((k) => setGeminiSaved(!!k)).catch(() => {});
    getSecureItem('anthropic_api_key').then((k) => setClaudeSaved(!!k)).catch(() => {});
  }, []);

  const handleSaveGeminiKey = async () => {
    if (!geminiKey.trim()) return;
    await setSecureItem('gemini_api_key', geminiKey.trim());
    setGeminiKey('');
    setGeminiSaved(true);
    Alert.alert('', 'Gemini API Key kaydedildi.');
  };

  const handleSaveClaudeKey = async () => {
    if (!claudeKey.trim()) return;
    await setSecureItem('anthropic_api_key', claudeKey.trim());
    setClaudeKey('');
    setClaudeSaved(true);
    Alert.alert('', 'Claude API Key kaydedildi.');
  };

  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url.startsWith('kpidashboard://oauth/callback')) return;
      try {
        const token = await handleOAuthCallback(url);
        await setSecureItem('netmera_mcp_token', token);
        setIsConnected(true);
        setIsLoggingIn(false);
        Alert.alert(t('settings.keysSavedTitle'), t('settings.netmeraLoginSuccess'));
      } catch (e: any) {
        setIsLoggingIn(false);
        Alert.alert(t('common.error'), e.message || String(e));
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => { if (url) handleUrl({ url }); });
    return () => subscription.remove();
  }, [t]);

  const handleNetmeraLogin = async () => {
    setIsLoggingIn(true);
    try {
      await startNetmeraOAuth();
    } catch (e: any) {
      setIsLoggingIn(false);
      Alert.alert(t('common.error'), e.message || String(e));
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
    AsyncStorage.setItem('@language', nextLng).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.header, { color: colors.text }]}>{t('settings.title')}</Text>

        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t('settings.appearance')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={[styles.item, { borderBottomColor: colors.border }]}
            onPress={handleLanguageChange}
          >
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

        {/* AI Services */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>AI Servisleri</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {/* Gemini */}
          <View style={[styles.apiKeyItem, { borderBottomColor: colors.border }]}>
            <View style={styles.apiKeyHeader}>
              <Text style={[styles.apiKeyLabel, { color: colors.text }]}>Gemini API Key</Text>
              {geminiSaved && (
                <View style={[styles.savedBadge, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                  <View style={styles.savedDot} />
                  <Text style={styles.savedText}>Kaydedildi</Text>
                </View>
              )}
            </View>
            <View style={styles.apiKeyRow}>
              <TextInput
                style={[styles.apiKeyInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                value={geminiKey}
                onChangeText={setGeminiKey}
                placeholder={geminiSaved ? '••••••••••••••••' : 'AIzaSy...'}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, { backgroundColor: geminiKey.trim() ? colors.accent : colors.border }]}
                onPress={handleSaveGeminiKey}
                disabled={!geminiKey.trim()}
              >
                <Text style={styles.saveKeyBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Claude */}
          <View style={styles.apiKeyItem}>
            <View style={styles.apiKeyHeader}>
              <Text style={[styles.apiKeyLabel, { color: colors.text }]}>Claude API Key</Text>
              {claudeSaved && (
                <View style={[styles.savedBadge, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                  <View style={styles.savedDot} />
                  <Text style={styles.savedText}>Kaydedildi</Text>
                </View>
              )}
            </View>
            <View style={styles.apiKeyRow}>
              <TextInput
                style={[styles.apiKeyInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                value={claudeKey}
                onChangeText={setClaudeKey}
                placeholder={claudeSaved ? '••••••••••••••••' : 'sk-ant-...'}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, { backgroundColor: claudeKey.trim() ? colors.accent : colors.border }]}
                onPress={handleSaveClaudeKey}
                disabled={!claudeKey.trim()}
              >
                <Text style={styles.saveKeyBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Netmera MCP Connection */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Netmera MCP</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <View style={styles.connectionItem}>
            {isConnected && (
              <View style={[styles.connectedBadge, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            )}
            <Text style={[styles.connectionDesc, { color: colors.textSecondary }]}>
              {t('settings.ssoInstruction')}
            </Text>
            <TouchableOpacity
              style={[
                styles.connectButton,
                { backgroundColor: isLoggingIn ? colors.border : colors.accent },
              ]}
              onPress={handleNetmeraLogin}
              disabled={isLoggingIn}
              activeOpacity={0.8}
            >
              {isLoggingIn ? (
                <View style={styles.buttonInner}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.connectButtonText}>{t('settings.connecting')}</Text>
                </View>
              ) : (
                <Text style={styles.connectButtonText}>{t('settings.netmeraLoginBtn')}</Text>
              )}
            </TouchableOpacity>
          </View>
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
  connectionItem: {
    padding: 20,
    gap: 14,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  connectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
  },
  connectionDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  connectButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  apiKeyItem: {
    padding: 20,
    gap: 12,
    borderBottomWidth: 1,
  },
  apiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  apiKeyLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  savedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  savedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  apiKeyRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  apiKeyInput: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  saveKeyBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveKeyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
