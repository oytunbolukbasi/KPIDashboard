import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/context/theme-context';
import { getAllSessions, deleteSession, type ChatSession } from '@/lib/chat-store';

export default function ChatHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getAllSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = (session: ChatSession) => {
    Alert.alert(
      t('chat.deleteTitle'),
      t('chat.deleteConfirm', { title: session.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(session.id);
              setSessions((prev) => prev.filter((s) => s.id !== session.id));
            } catch (e) {
              Alert.alert(t('common.error'), t('chat.deleteError'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    if (sessions.length === 0) return;
    Alert.alert(
      t('common.deleteAll'),
      t('chat.deleteAllConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.deleteAll'),
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(sessions.map((s) => deleteSession(s.id)));
              setSessions([]);
            } catch (e) {
              Alert.alert(t('common.error'), t('chat.deleteAllError'));
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('chat.justNow');
    if (diffMins < 60) return t('chat.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('chat.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('chat.daysAgo', { count: diffDays });
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const messageCount = (session: ChatSession) =>
    Math.ceil(session.messages.length / 2);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backChevron, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('chat.history')}</Text>
        {sessions.length > 0 ? (
          <TouchableOpacity
            style={[styles.deleteAllBtn, { backgroundColor: colors.redLight }]}
            onPress={handleDeleteAll}
          >
            <Text style={[styles.deleteAllBtnText, { color: colors.red }]}>{t('common.deleteAll')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('chat.noHistory')}</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('chat.noHistoryDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadSessions(); }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={styles.cardContent}
                activeOpacity={0.7}
                onPress={() => router.push(`/chat-session-detail?id=${item.id}`)}
              >
                <View style={[styles.cardIcon, { backgroundColor: colors.accentLight }]}>
                  <Text style={[styles.cardIconInitial, { color: colors.accent }]}>
                    {item.title.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardMetaText, { color: colors.textTertiary }]}>
                      {t('chat.message_one', { count: messageCount(item) })}
                    </Text>
                    <Text style={[styles.cardMetaDot, { color: colors.textTertiary }]}> · </Text>
                    <Text style={[styles.cardMetaText, { color: colors.textTertiary }]}>
                      {formatDate(item.updatedAt)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteBtn, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => handleDelete(item)}
              >
                <Text style={[styles.deleteBtnText, { color: colors.textTertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  backChevron: { fontSize: 32, fontWeight: '200', lineHeight: 36, marginLeft: -2 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  deleteAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  deleteAllBtnText: { fontSize: 13, fontWeight: '600' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, gap: 12 },
  card: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center' },
  cardMetaText: { fontSize: 12 },
  cardMetaDot: { fontSize: 12 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '500' },
});
