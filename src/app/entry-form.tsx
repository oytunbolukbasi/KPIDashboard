import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, FlatList } from 'react-native';
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

  const MONTHS = [
    { label: 'Oca', value: '01' }, { label: 'Şub', value: '02' }, { label: 'Mar', value: '03' },
    { label: 'Nis', value: '04' }, { label: 'May', value: '05' }, { label: 'Haz', value: '06' },
    { label: 'Tem', value: '07' }, { label: 'Ağu', value: '08' }, { label: 'Eyl', value: '09' },
    { label: 'Eki', value: '10' }, { label: 'Kas', value: '11' }, { label: 'Ara', value: '12' },
  ];
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 5 }, (_, i) => String(currentYear - 2 + i));

  const parseMonthYear = (d: string) => {
    const parts = d.split('.');
    if (parts.length === 2) return { month: parts[0], year: parts[1] };
    // legacy DD.MM.YYYY format
    if (parts.length === 3) return { month: parts[1], year: parts[2] };
    return { month: String(new Date().getMonth() + 1).padStart(2, '0'), year: String(new Date().getFullYear()) };
  };

  const [selMonth, setSelMonth] = useState(
    String(new Date().getMonth() + 1).padStart(2, '0')
  );
  const [selYear, setSelYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    if (isEdit && params.id) {
      const entry = entries.find((e) => e.id === params.id);
      if (entry) {
        const parsed = parseMonthYear(entry.date);
        setSelMonth(parsed.month);
        setSelYear(parsed.year);
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
    const dateStr = `${selMonth}.${selYear}`;

    const data = {
      date: dateStr,
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
        {/* Month/Year Picker */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 10 }]}>{t('form.date')}</Text>
        <View style={[styles.monthPickerContainer, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          {/* Month selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthPickerRow}>
            {MONTHS.map(m => (
              <TouchableOpacity
                key={m.value}
                onPress={() => setSelMonth(m.value)}
                style={[
                  styles.monthPickerChip,
                  selMonth === m.value && { backgroundColor: colors.accent }
                ]}
              >
                <Text style={[
                  styles.monthPickerChipText,
                  { color: selMonth === m.value ? '#fff' : colors.text }
                ]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Year selector */}
          <View style={[styles.yearPickerRow, { borderTopColor: colors.border }]}>
            {YEARS.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => setSelYear(y)}
                style={[
                  styles.yearPickerItem,
                  selYear === y && { backgroundColor: colors.accent, borderRadius: 10 }
                ]}
              >
                <Text style={[
                  styles.yearPickerText,
                  { color: selYear === y ? '#fff' : colors.textSecondary },
                  selYear === y && { fontWeight: '800' }
                ]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
  // Month/Year Picker
  monthPickerContainer: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
  },
  monthPickerRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  monthPickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  monthPickerChipText: { fontSize: 14, fontWeight: '600' },
  yearPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    borderTopWidth: 1,
  },
  yearPickerItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  yearPickerText: { fontSize: 14, fontWeight: '600' },
});
