import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/context/theme-context';
import { getSession, type ChatSession } from '@/lib/chat-store';
import type { AgentMessage, ToolCall } from '@/lib/gemini-agent';

export default function ChatSessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeContext();
  const { t } = useTranslation();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getSession(id)
      .then(setSession)
      .catch((e) => console.error('Failed to load session:', e))
      .finally(() => setLoading(false));
  }, [id]);

  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    let tableRows: string[][] = [];
    let insideTable = false;

    return lines.map((line, idx) => {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        insideTable = true;
        if (line.includes('---')) return null;
        const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        tableRows.push(cells);
        const nextLine = lines[idx + 1];
        const nextIsTable = nextLine && nextLine.trim().startsWith('|') && nextLine.trim().endsWith('|');
        if (!nextIsTable) {
          const tableToRender = [...tableRows];
          tableRows = [];
          insideTable = false;
          return (
            <View key={`table-${idx}`} style={[styles.tableContainer, { borderColor: colors.border }]}>
              {tableToRender.map((row, rIdx) => (
                <View
                  key={`row-${rIdx}`}
                  style={[
                    styles.tableRow,
                    {
                      borderBottomWidth: rIdx === tableToRender.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                      backgroundColor: rIdx === 0 ? colors.accentLight : 'transparent',
                    },
                  ]}
                >
                  {row.map((cell, cIdx) => (
                    <Text
                      key={`cell-${cIdx}`}
                      style={[styles.tableCell, { color: colors.text, fontWeight: rIdx === 0 ? '700' : '400', fontSize: 12 }]}
                    >
                      {cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          );
        }
        return null;
      }

      if (insideTable) return null;

      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const bulletText = line.trim().substring(2);
        return (
          <View key={idx} style={styles.bulletRow}>
            <Text style={[styles.bulletDot, { color: colors.accent }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.text }]}>{bulletText}</Text>
          </View>
        );
      }

      const boldParts = line.split('**');
      if (boldParts.length > 1) {
        return (
          <Text key={idx} style={[styles.messageText, { color: colors.text }]}>
            {boldParts.map((part, pIdx) => (
              <Text key={pIdx} style={pIdx % 2 !== 0 ? { fontWeight: '700', color: colors.accent } : undefined}>
                {part}
              </Text>
            ))}
          </Text>
        );
      }

      return (
        <Text key={idx} style={[styles.messageText, { color: colors.text }]}>
          {line}
        </Text>
      );
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backChevron, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {session?.title ?? t('chat.defaultTitle')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : !session ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{t('chat.notFound')}</Text>
        </View>
      ) : (
        <FlatList
          data={session.messages.filter((m) => m.role !== 'system')}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: AgentMessage }) => {
            const isUser = item.role === 'user';
            return (
              <View style={styles.messageWrapper}>
                {!isUser && item.toolCalls && item.toolCalls.length > 0 && (
                  <View style={styles.toolCallsContainer}>
                    {item.toolCalls.map((call: ToolCall, cIdx: number) => (
                      <View
                        key={cIdx}
                        style={[
                          styles.toolPill,
                          {
                            backgroundColor: call.error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                            borderColor: call.error ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                          },
                        ]}
                      >
                        <View style={[styles.toolDot, { backgroundColor: call.error ? '#ef4444' : '#10b981' }]} />
                        <Text style={[styles.toolPillText, { color: colors.text }]}>{call.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={[styles.messageRow, isUser ? styles.userRow : styles.modelRow]}>
                  <View
                    style={[
                      styles.messageBubble,
                      isUser
                        ? styles.userBubble
                        : [styles.modelBubble, { backgroundColor: isDark ? colors.surface : '#F2F2F7' }],
                    ]}
                  >
                    {isUser ? (
                      <Text style={styles.userMessageText}>{item.content}</Text>
                    ) : (
                      renderMessageContent(item.content)
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
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
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  headerRight: { width: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { fontSize: 15 },
  messageList: { padding: 20, paddingBottom: 40 },
  messageWrapper: { marginBottom: 16, width: '100%' },
  messageRow: { flexDirection: 'row', width: '100%' },
  userRow: { justifyContent: 'flex-end' },
  modelRow: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '85%', borderRadius: 20, padding: 14 },
  userBubble: { backgroundColor: '#1C1C1E', borderBottomRightRadius: 4 },
  modelBubble: { borderBottomLeftRadius: 4 },
  userMessageText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500', lineHeight: 20 },
  messageText: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2, paddingLeft: 4 },
  bulletDot: { fontSize: 16, marginRight: 8 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22 },
  tableContainer: { borderWidth: 1, borderRadius: 8, marginVertical: 10, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8 },
  tableCell: { flex: 1, paddingRight: 8 },
  toolCallsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  toolPill: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolDot: { width: 6, height: 6, borderRadius: 3 },
  toolPillText: { fontSize: 12, fontWeight: '600' },
});
