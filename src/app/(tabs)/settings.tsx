import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeContext } from '@/context/theme-context';
import { useKPI } from '@/context/kpi-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollToTopListener } from '@/context/scroll-to-top-context';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { isDark, toggleTheme, colors } = useThemeContext();
  const { deleteAll } = useKPI();
  const insets = useSafeAreaInsets();

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
});
