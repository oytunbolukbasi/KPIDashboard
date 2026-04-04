import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKPI } from '@/context/kpi-context';
import { useThemeContext } from '@/context/theme-context';

function parseNumber(val: string): number {
  const cleaned = val.replace(/[^0-9.,]/g, '').replace(',', '.');
  return Number(cleaned) || 0;
}

function formatInput(val: number): string {
  return val === 0 ? '' : val.toString();
}

export default function EntryFormScreen() {
  const { t } = useTranslation();
  const { entries, addEntry, updateEntry } = useKPI();
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!params.id;

  const [date, setDate] = useState('');
  const [downloadIos, setDownloadIos] = useState('');
  const [downloadAndroid, setDownloadAndroid] = useState('');
  const [activeUsers, setActiveUsers] = useState('');
  const [pushOptInIos, setPushOptInIos] = useState('');
  const [pushOptInAndroid, setPushOptInAndroid] = useState('');
  const [mau, setMau] = useState('');
  const [dau, setDau] = useState('');

  useEffect(() => {
    if (isEdit && params.id) {
      const entry = entries.find((e) => e.id === params.id);
      if (entry) {
        setDate(entry.date);
        setDownloadIos(formatInput(entry.downloadIos));
        setDownloadAndroid(formatInput(entry.downloadAndroid));
        setActiveUsers(formatInput(entry.activeUsers));
        setPushOptInIos(formatInput(entry.pushOptInIos));
        setPushOptInAndroid(formatInput(entry.pushOptInAndroid));
        setMau(formatInput(entry.mau));
        setDau(formatInput(entry.dau));
      }
    }
  }, [isEdit, params.id, entries]);

  const handleSave = async () => {
    if (!date.trim()) return;

    const data = {
      date: date.trim(),
      downloadIos: parseNumber(downloadIos),
      downloadAndroid: parseNumber(downloadAndroid),
      activeUsers: parseNumber(activeUsers),
      pushOptInIos: parseNumber(pushOptInIos),
      pushOptInAndroid: parseNumber(pushOptInAndroid),
      mau: parseNumber(mau),
      dau: parseNumber(dau),
    };

    if (isEdit && params.id) {
      await updateEntry(params.id, data);
    } else {
      await addEntry(data);
    }
    
    Alert.alert(
      t('form.success', 'Başarılı'),
      isEdit ? t('form.updated', 'Veriler güncellendi.') : t('form.saved', 'Veriler kaydedildi.'),
      [{ text: 'Tamam', onPress: () => router.back() }]
    );
  };

  const renderField = (label: string, value: string, onChangeText: (v: string) => void, placeholder?: string, hint?: string) => (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || '0'}
        placeholderTextColor={colors.textTertiary}
        keyboardType="numeric"
      />
      {hint && <Text style={[styles.hint, { color: colors.textTertiary }]}>{hint}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelBtn, { color: colors.textSecondary }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>
          {isEdit ? t('form.editTitle') : t('form.addTitle')}
        </Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={[styles.saveBtn, { color: colors.accent }]}>
            {isEdit ? t('form.update') : t('form.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Date */}
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('form.date')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
            value={date}
            onChangeText={setDate}
            placeholder={t('form.datePlaceholder')}
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        {/* Downloads Section */}
        <Text style={[styles.sectionTitle, { color: colors.accent }]}>{t('form.downloads')}</Text>
        <View style={styles.row}>
          {renderField(t('form.iosDownloads'), downloadIos, setDownloadIos)}
          {renderField(t('form.androidDownloads'), downloadAndroid, setDownloadAndroid)}
        </View>

        {/* Active Users */}
        <Text style={[styles.sectionTitle, { color: colors.green }]}>{t('form.activeUsers')}</Text>
        {renderField(t('form.activeUsers'), activeUsers, setActiveUsers, '0', t('form.activeUsersHint'))}

        {/* Push Opt-in */}
        <Text style={[styles.sectionTitle, { color: colors.blue }]}>{t('form.pushOptIn')}</Text>
        <View style={styles.row}>
          {renderField(t('form.iosPush'), pushOptInIos, setPushOptInIos)}
          {renderField(t('form.androidPush'), pushOptInAndroid, setPushOptInAndroid)}
        </View>

        {/* Engagement */}
        <Text style={[styles.sectionTitle, { color: colors.chartLine4 }]}>{t('form.engagement')}</Text>
        <View style={styles.row}>
          {renderField('MAU', mau, setMau)}
          {renderField('DAU', dau, setDau)}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  cancelBtn: { fontSize: 20, fontWeight: '600', padding: 4 },
  topTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: { fontSize: 16, fontWeight: '700', padding: 4 },
  scrollContent: { padding: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 12 },
  fieldContainer: { flex: 1, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 1,
  },
  hint: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
});
