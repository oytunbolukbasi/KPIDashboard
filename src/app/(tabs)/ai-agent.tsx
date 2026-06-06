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
  Animated,
  Easing,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem } from '@/lib/secure-store-fallback';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '@/context/theme-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeminiNetmeraAgent, AgentMessage, ToolCall } from '@/lib/gemini-agent';
import { ClaudeNetmeraAgent } from '@/lib/claude-agent';
import { createSession, updateSession } from '@/lib/chat-store';

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'claude' },
] as const;

type ModelId = typeof MODELS[number]['id'];

const MODEL_STORAGE_KEY = '@ai_agent_selected_model';

async function checkKeysForModel(modelId: ModelId): Promise<boolean> {
  try {
    const nTok = await getSecureItem('netmera_mcp_token');
    if (!nTok) return false;
    if (modelId === 'gemini-2.5-flash') {
      const key = await getSecureItem('gemini_api_key');
      return !!key;
    }
    const key = await getSecureItem('anthropic_api_key');
    return !!key;
  } catch {
    return false;
  }
}

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
  const [selectedModel, setSelectedModel] = useState<ModelId>('gemini-2.5-flash');
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number } | null>(null);
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerRef = useRef<any>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Gradient glow animation (3 color phases cycling during loading)
  const glowPhase = useRef(new Animated.Value(0)).current;
  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Each glow fades in/out gently — peaks at 0.55 opacity, slow transitions
  const glow1Opacity = glowPhase.interpolate({
    inputRange: [0, 0.12, 0.28, 0.36, 1],
    outputRange: [0, 0.55, 0.45, 0, 0],
  });
  const glow2Opacity = glowPhase.interpolate({
    inputRange: [0, 0.36, 0.48, 0.62, 0.7, 1],
    outputRange: [0, 0, 0.55, 0.45, 0, 0],
  });
  const glow3Opacity = glowPhase.interpolate({
    inputRange: [0, 0.7, 0.82, 0.96, 1],
    outputRange: [0, 0, 0.55, 0.45, 0],
  });

  useEffect(() => {
    async function init() {
      const saved = await AsyncStorage.getItem(MODEL_STORAGE_KEY);
      const model = (saved ?? 'gemini-2.5-flash') as ModelId;
      setSelectedModel(model);
      setKeysConfigured(await checkKeysForModel(model));
    }
    init();
  }, []);

  const handleModelSelect = async (modelId: ModelId) => {
    setModelPickerVisible(false);
    setSelectedModel(modelId);
    await AsyncStorage.setItem(MODEL_STORAGE_KEY, modelId);
    setMessages([]);
    setCurrentSessionId(null);
    setKeysConfigured(null);
    setKeysConfigured(await checkKeysForModel(modelId));
  };

  const showModelPicker = () => {
    triggerRef.current?.measure((_fx: number, _fy: number, _w: number, h: number, px: number, py: number) => {
      setDropdownPos({ x: px, y: py + h + 6 });
      setModelPickerVisible(true);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      glowPhase.setValue(0);
      glowLoopRef.current = Animated.loop(
        Animated.timing(glowPhase, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      );
      glowLoopRef.current.start();
    } else {
      glowLoopRef.current?.stop();
      glowLoopRef.current = null;
      Animated.timing(glowPhase, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const netmeraToken = await getSecureItem('netmera_mcp_token');

    if (!netmeraToken) {
      Alert.alert(
        t('settings.keysSaveError', 'Bağlantı Eksik'),
        t('settings.keysMissingMsg', 'Lütfen önce Ayarlar sekmesinden Netmera bağlantısını tamamlayın.')
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
      let agentResult: { content: string; toolCalls?: ToolCall[] };

      if (selectedModel === 'gemini-2.5-flash') {
        const geminiKey = await getSecureItem('gemini_api_key');
        if (!geminiKey) {
          Alert.alert('Gemini API Key Eksik', 'Ayarlar > AI Servisleri kısmından Gemini API Key ekleyin.');
          setLoading(false);
          setMessages(messages);
          return;
        }
        const agent = new GeminiNetmeraAgent(geminiKey, netmeraToken);
        agentResult = await agent.run(textToSend, messages, (status) => setStatusMessage(status));
      } else {
        const anthropicKey = await getSecureItem('anthropic_api_key');
        if (!anthropicKey) {
          Alert.alert('Claude API Key Eksik', 'Ayarlar > AI Servisleri kısmından Claude API Key ekleyin.');
          setLoading(false);
          setMessages(messages);
          return;
        }
        const agent = new ClaudeNetmeraAgent(anthropicKey, netmeraToken, selectedModel);
        agentResult = await agent.run(textToSend, messages, (status) => setStatusMessage(status));
      }

      const response = agentResult;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const fullContent = response.content;
      const modelMsg: AgentMessage = { role: 'model', content: '' };
      if (response.toolCalls?.length) modelMsg.toolCalls = response.toolCalls;

      const finalMessages: AgentMessage[] = [...updatedMessages, modelMsg];
      const newMsgIndex = finalMessages.length - 1;
      setMessages(finalMessages);
      setStreamingIndex(newMsgIndex);

      // Scroll to TOP of new agent message so user reads from the beginning
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({ index: newMsgIndex, animated: true, viewPosition: 0 });
        } catch {}
      }, 80);

      // Adaptive typewriter: target ~1.5s regardless of response length
      if (typewriterRef.current) clearInterval(typewriterRef.current);
      const TICK_MS = 20;
      const TARGET_TICKS = 75;
      const chunkSize = Math.min(30, Math.max(3, Math.ceil(fullContent.length / TARGET_TICKS)));
      let pos = 0;

      typewriterRef.current = setInterval(() => {
        pos = Math.min(pos + chunkSize, fullContent.length);
        const slice = fullContent.slice(0, pos);
        setMessages(prev => {
          const updated = [...prev];
          if (updated[newMsgIndex]) {
            updated[newMsgIndex] = { ...updated[newMsgIndex], content: slice };
          }
          return updated;
        });
        if (pos >= fullContent.length) {
          clearInterval(typewriterRef.current!);
          typewriterRef.current = null;
          setStreamingIndex(null);
          // Save to Firestore with full content after typewriter completes
          const completedMsg: AgentMessage = { ...modelMsg, content: fullContent };
          const completedMessages = [...updatedMessages, completedMsg];
          const toSave = sanitizeMessages(completedMessages);
          (currentSessionId
            ? updateSession(currentSessionId, toSave)
            : createSession(toSave).then(s => setCurrentSessionId(s.id))
          ).catch(e => console.warn('Chat history save failed:', e));
        }
      }, TICK_MS);
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
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } finally {
      setLoading(false);
      setStatusMessage('');
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
      {/* Base gradient: bottom-to-top, always visible */}
      <LinearGradient
        colors={isDark
          ? ['transparent', 'rgba(129,140,248,0.13)']
          : ['transparent', 'rgba(79,70,229,0.08)']}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Glow layer 1: purple/indigo — phase 1 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: glow1Opacity }]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', 'rgba(147,51,234,0.18)', 'rgba(99,102,241,0.12)']}
          start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {/* Glow layer 2: cyan/blue — phase 2 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: glow2Opacity }]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', 'rgba(6,182,212,0.16)', 'rgba(59,130,246,0.12)']}
          start={{ x: 0.8, y: 0 }} end={{ x: 0.2, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {/* Glow layer 3: pink/magenta — phase 3 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: glow3Opacity }]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', 'rgba(236,72,153,0.15)', 'rgba(167,139,250,0.12)']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            ref={triggerRef}
            style={styles.headerTitleContainer}
            onPress={showModelPicker}
            activeOpacity={0.7}
          >
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {MODELS.find(m => m.id === selectedModel)?.label ?? 'AI Agent'}
            </Text>
            <Ionicons name="chevron-down" size={15} color={colors.textSecondary} style={styles.headerChevron} />
          </TouchableOpacity>
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
          onScrollToIndexFailed={({ index: failedIndex, averageItemLength }) => {
            flatListRef.current?.scrollToOffset({
              offset: averageItemLength * failedIndex,
              animated: true,
            });
          }}
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
          renderItem={({ item, index }) => {
            const isUser = item.role === 'user';
            const isTyping = streamingIndex === index;
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
                    ) : isTyping ? (
                      <Text style={[styles.messageText, { color: colors.text }]}>{item.content}</Text>
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
        <View style={styles.inputContainer}>
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

        {/* Model Picker Dropdown */}
        <Modal
          visible={modelPickerVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setModelPickerVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setModelPickerVisible(false)}
          >
            {dropdownPos && (
              <View
                style={[
                  styles.dropdown,
                  {
                    top: dropdownPos.y,
                    left: dropdownPos.x,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                {MODELS.map((model, idx) => (
                  <TouchableOpacity
                    key={model.id}
                    style={[
                      styles.dropdownItem,
                      idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                    ]}
                    onPress={() => handleModelSelect(model.id)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.dropdownItemContent}>
                      <Text style={[styles.dropdownProvider, { color: colors.textTertiary }]}>
                        {model.provider === 'gemini' ? 'Google' : 'Anthropic'}
                      </Text>
                      <Text style={[styles.dropdownLabel, { color: colors.text }]}>{model.label}</Text>
                    </View>
                    {selectedModel === model.id && (
                      <Ionicons name="checkmark" size={18} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </Modal>

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
    gap: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '500',
  },
  headerChevron: {
    marginTop: 1,
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
    backgroundColor: 'transparent',
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
  dropdown: {
    position: 'absolute',
    minWidth: 230,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  dropdownItemContent: {
    gap: 2,
  },
  dropdownProvider: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 1,
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
