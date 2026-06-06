import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { getSecureItem } from '@/lib/secure-store-fallback';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '@/context/theme-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeminiNetmeraAgent, AgentMessage, ToolCall } from '@/lib/gemini-agent';
import { createSession, updateSession } from '@/lib/chat-store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Strip undefined values from messages before writing to Firestore. */
function sanitizeMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(msg => {
    const clean: AgentMessage = { role: msg.role, content: msg.content ?? '' };
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      clean.toolCalls = msg.toolCalls.map(call => ({
        name: call.name ?? '',
        args: call.args ?? null,
        response: call.response ?? null,
        ...(call.error !== undefined ? { error: call.error } : {}),
      }));
    }
    return clean;
  });
}

export default function AIAgentScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [keysConfigured, setKeysConfigured] = useState<boolean | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedToolCall, setSelectedToolCall] = useState<ToolCall | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    async function checkKeys() {
      try {
        const gKey = await getSecureItem('gemini_api_key');
        const nTok = await getSecureItem('netmera_mcp_token');
        setKeysConfigured(!!(gKey && nTok));
      } catch (e) {
        setKeysConfigured(false);
      }
    }
    checkKeys();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const geminiKey = await getSecureItem('gemini_api_key');
    const netmeraToken = await getSecureItem('netmera_mcp_token');

    if (!geminiKey || !netmeraToken) {
      Alert.alert(
        t('settings.keysSaveError', 'Anahtarlar Eksik'),
        t('settings.keysMissingMsg', 'Lütfen önce Ayarlar sekmesinden API anahtarlarını kaydedin.')
      );
      return;
    }

    const userMsg: AgentMessage = { role: 'user', content: textToSend };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);
    setStatusMessage(t('aiAgent.starting'));

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const agent = new GeminiNetmeraAgent(geminiKey, netmeraToken);
      const response = await agent.run(textToSend, messages, (status) => {
        setStatusMessage(status);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const modelMsg: AgentMessage = { role: 'model', content: response.content };
      if (response.toolCalls && response.toolCalls.length > 0) {
        modelMsg.toolCalls = response.toolCalls;
      }
      const finalMessages: AgentMessage[] = [...updatedMessages, modelMsg];
      setMessages(finalMessages);

      try {
        const toSave = sanitizeMessages(finalMessages);
        if (currentSessionId) {
          await updateSession(currentSessionId, toSave);
        } else {
          const session = await createSession(toSave);
          setCurrentSessionId(session.id);
        }
      } catch (storeErr) {
        console.warn('Chat history save failed:', storeErr);
      }
    } catch (e: any) {
      console.error('Agent execution error:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessages([
        ...updatedMessages,
        {
          role: 'model',
          content: t('aiAgent.errorMsg', { message: e.message || t('common.error') }),
        },
      ]);
    } finally {
      setLoading(false);
      setStatusMessage('');
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const quickPrompts = [
    { text: t('aiAgent.quickPrompt1'), prompt: 'Netmera uygulamamın genel sağlık durumunu ve aktif cihaz istatistiklerini kontrol et.' },
    { text: t('aiAgent.quickPrompt2'), prompt: 'Son gönderilen kampanyaların genel delivery ve tıklanma istatistiklerini getir.' },
    { text: t('aiAgent.quickPrompt3'), prompt: 'VIP segmentinde kaç kullanıcı var ve bu kullanıcıların son durumu nedir?' },
    { text: t('aiAgent.quickPrompt4'), prompt: 'Netmera panelindeki funnel raporlarını listele ve en son verileri göster.' },
  ];

  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    let insideTable = false;
    let tableRows: string[][] = [];

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
                      style={[
                        styles.tableCell,
                        { color: colors.text, fontWeight: rIdx === 0 ? '700' : '400', fontSize: 12 },
                      ]}
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
            {boldParts.map((part, pIdx) => {
              const isBold = pIdx % 2 !== 0;
              return (
                <Text key={pIdx} style={isBold ? { fontWeight: '700', color: colors.accent } : undefined}>
                  {part}
                </Text>
              );
            })}
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

  if (keysConfigured === false) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>AI Agent</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            {t('aiAgent.keysRequiredDesc')}
          </Text>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.accent }]}
            onPress={() => router.navigate('/settings')}
          >
            <Text style={styles.actionButtonText}>{t('common.goToSettings')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cardWidth = (SCREEN_WIDTH - 48 - 12) / 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {messages.length === 0 && (
        <LinearGradient
          colors={isDark
            ? ['rgba(129,140,248,0.14)', 'transparent']
            : ['rgba(79,70,229,0.09)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.65 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}
      <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleContainer}>
            <View style={[styles.statusDot, { backgroundColor: loading ? colors.orange : colors.green }]} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>AI Agent</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {messages.length > 0 && (
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: colors.accentLight }]}
                onPress={() => {
                  setMessages([]);
                  setCurrentSessionId(null);
                }}
              >
                <Text style={[styles.headerBtnText, { color: colors.accent }]}>{t('aiAgent.newChat')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => router.push('/chat-history')}
            >
              <Text style={[styles.headerBtnText, { color: colors.textSecondary }]}>{t('aiAgent.history')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Message List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.welcomeContainer}>
              <Text style={[styles.welcomeTitle, { color: colors.text }]}>
                {t('aiAgent.welcome')}
              </Text>

              <View style={styles.quickGrid}>
                {quickPrompts.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.quickCard,
                      { backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.7)', width: cardWidth },
                    ]}
                    onPress={() => handleSend(item.prompt)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.quickCardText, { color: colors.text }]}>{item.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={styles.messageWrapper}>
                {!isUser && item.toolCalls && item.toolCalls.length > 0 && (
                  <View style={styles.toolCallsContainer}>
                    {item.toolCalls.map((call: ToolCall, cIdx: number) => (
                      <ToolCallPill
                        key={cIdx}
                        call={call}
                        colors={colors}
                        onPress={() => setSelectedToolCall(call)}
                      />
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

        {/* Loading indicator */}
        {loading && (
          <View style={[styles.statusIndicator, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.text }]}>{statusMessage}</Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={[styles.inputContainer, { backgroundColor: colors.background }]}>
          <View style={[
            styles.inputCard,
            {
              backgroundColor: isDark ? colors.surface : '#FFFFFF',
              borderColor: isDark ? colors.border : 'transparent',
              borderWidth: isDark ? 1 : 0,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0 : 0.07,
              shadowOffset: { width: 0, height: -2 },
              shadowRadius: 16,
              elevation: 4,
            },
          ]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.text }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={t('aiAgent.placeholder')}
              placeholderTextColor={colors.textTertiary}
              editable={!loading}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: inputText.trim() && !loading ? '#1C1C1E' : colors.border },
              ]}
              onPress={() => handleSend(inputText)}
              disabled={!inputText.trim() || loading}
            >
              <Text style={styles.sendArrow}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tool Call Detail Sheet */}
        <Modal
          visible={selectedToolCall !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedToolCall(null)}
        >
          {selectedToolCall && (
            <ToolCallDetailSheet
              call={selectedToolCall}
              colors={colors}
              isDark={isDark}
              onClose={() => setSelectedToolCall(null)}
            />
          )}
        </Modal>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  messageList: {
    padding: 20,
    paddingBottom: 40,
  },
  welcomeContainer: {
    paddingTop: 40,
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    marginBottom: 36,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    borderRadius: 16,
    padding: 16,
    minHeight: 80,
    justifyContent: 'flex-end',
  },
  quickCardText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  messageWrapper: {
    marginBottom: 16,
    width: '100%',
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  modelRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 20,
    padding: 14,
  },
  userBubble: {
    backgroundColor: '#1C1C1E',
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 16,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    maxHeight: 100,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  statusText: {
    marginLeft: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 80,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  emptyDesc: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  actionButton: {
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 10,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tableCell: {
    flex: 1,
    paddingRight: 8,
  },
  toolCallsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  toolPill: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toolPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIndicatorCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toolPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolPillArrow: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sheetContainer: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetHeaderTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  sheetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sheetBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sheetCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  sheetCloseBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: 20,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorBoxTitle: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorBoxText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  codeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

interface ToolCallPillProps {
  call: ToolCall;
  colors: any;
  onPress: () => void;
}

const ToolCallPill: React.FC<ToolCallPillProps> = ({ call, colors, onPress }) => {
  const hasError = !!call.error;
  return (
    <TouchableOpacity
      style={[
        styles.toolPill,
        {
          backgroundColor: hasError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          borderColor: hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.toolPillContent}>
        <View style={[styles.statusIndicatorCircle, { backgroundColor: hasError ? '#ef4444' : '#10b981' }]} />
        <Text style={[styles.toolPillText, { color: colors.text }]}>{call.name}</Text>
        <Text style={[styles.toolPillArrow, { color: colors.textSecondary }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

interface ToolCallDetailSheetProps {
  call: ToolCall;
  colors: any;
  isDark: boolean;
  onClose: () => void;
}

const ToolCallDetailSheet: React.FC<ToolCallDetailSheetProps> = ({ call, colors, isDark: _isDark, onClose }) => {
  const { t } = useTranslation();
  const hasError = !!call.error;

  return (
    <SafeAreaView style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
        <View style={styles.sheetHeaderTitleContainer}>
          <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
            {call.name}
          </Text>
          <View
            style={[
              styles.sheetBadge,
              { backgroundColor: hasError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' },
            ]}
          >
            <Text style={[styles.sheetBadgeText, { color: hasError ? '#ef4444' : '#10b981' }]}>
              {hasError ? t('aiAgent.toolError') : t('aiAgent.toolSuccess')}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={[styles.sheetCloseBtn, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sheetCloseBtnText, { color: colors.textSecondary }]}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        {hasError && (
          <View style={[styles.errorBox, { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }]}>
            <Text style={styles.errorBoxTitle}>{t('aiAgent.toolErrorDetail')}</Text>
            <Text style={[styles.errorBoxText, { color: colors.text }]}>{call.error}</Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('aiAgent.toolArguments')}</Text>
        <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 20 }]}>
          <Text style={[styles.codeText, { color: colors.text }]}>
            {JSON.stringify(call.args, null, 2)}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('aiAgent.toolResponse')}</Text>
        <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.codeText, { color: colors.text }]}>
            {typeof call.response === 'string' ? call.response : JSON.stringify(call.response, null, 2)}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
