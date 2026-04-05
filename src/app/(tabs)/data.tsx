import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, Alert, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKPI } from '@/context/kpi-context';
import { useThemeContext } from '@/context/theme-context';
import type { KPIEntryComputed } from '@/types/kpi';

const { width } = Dimensions.get('window');

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toFixed(0);
}

function EntryCard({ item, colors, t, onEdit, onDelete }: {
  item: KPIEntryComputed;
  colors: any;
  t: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onEdit}
      onLongPress={onDelete}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardDate, { color: colors.accent }]}>{item.date}</Text>
        <View style={[styles.stickyBadge, { backgroundColor: colors.accentLight }]}>
          <Text style={[styles.stickyText, { color: colors.accent }]}>
            {item.stickiness.toFixed(1)}%
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('dashboard.downloads')}</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>{formatNum(item.downloadTotal)}</Text>
          <View style={styles.metricSub}>
            <Text style={[styles.metricSubText, { color: colors.textTertiary }]}>
              iOS {formatNum(item.downloadIos)} · And {formatNum(item.downloadAndroid)}
            </Text>
          </View>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('dashboard.activeUsers')}</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>{formatNum(item.activeUsers)}</Text>
          <Text style={[styles.metricSubText, { color: colors.textTertiary }]}>{item.activeUsersPercentage.toFixed(0)}%</Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>MAU</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>{formatNum(item.mau)}</Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>DAU</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>{formatNum(item.dau)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DataScreen() {
  const { t } = useTranslation();
  const { computed, deleteEntry } = useKPI();
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();

  // Reverse chronological (newest first)
  const sortedData = [...computed].reverse();

  const handleEdit = (item: KPIEntryComputed) => {
    router.push({ pathname: '/entry-form', params: { id: item.id } } as unknown as Href);
  };

  const handleDelete = (item: KPIEntryComputed) => {
    Alert.alert(
      t('data.delete'),
      t('data.deleteConfirm'),
      [
        { text: t('data.cancel'), style: 'cancel' },
        { text: t('data.delete'), style: 'destructive', onPress: () => deleteEntry(item.id) },
      ]
    );
  };

  const handleAdd = () => {
    router.push('/entry-form' as Href);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: colors.text }]}>{t('data.title')}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.accent }]} onPress={handleAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ {t('form.addTitle')}</Text>
        </TouchableOpacity>
      </View>

      {sortedData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('data.noEntries')}</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('data.noEntriesDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EntryCard
              item={item}
              colors={colors}
              t={t}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 16, marginBottom: 16 },
  header: { fontSize: 24, fontWeight: '800' },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  listContent: { padding: 20, paddingBottom: 120 },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardDate: { fontSize: 15, fontWeight: '700' },
  stickyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  stickyText: { fontSize: 12, fontWeight: '800' },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricItem: {
    width: (width - 80) / 2 - 6,
  },
  metricLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricSub: { marginTop: 2 },
  metricSubText: { fontSize: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
});
