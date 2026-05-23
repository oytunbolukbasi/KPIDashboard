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
  ScrollView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { getSecureItem } from '@/lib/secure-store-fallback';
import * as Haptics from 'expo-haptics';
import { useThemeContext } from '@/context/theme-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeminiNetmeraAgent, AgentMessage, ToolCall } from '@/lib/gemini-agent';
import { createSession, updateSession } from '@/lib/chat-store';

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

  // Check if keys are configured
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

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Retrieve keys from secure storage on action
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
    setStatusMessage('Başlatılıyor...');

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const agent = new GeminiNetmeraAgent(geminiKey, netmeraToken);
      const response = await agent.run(textToSend, messages, (status) => {
        setStatusMessage(status);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const finalMessages: AgentMessage[] = [
        ...updatedMessages,
        { role: 'model', content: response.content, toolCalls: response.toolCalls }
      ];
      setMessages(finalMessages);

      // Save / update Firestore chat session
      try {
        if (currentSessionId) {
          await updateSession(currentSessionId, finalMessages);
        } else {
          const session = await createSession(finalMessages);
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
          content: `Hata oluştu: ${e.message || 'Bilinmeyen bir hata meydana geldi. Lütfen API anahtarlarınızı ve internet bağlantınızı kontrol edin.'}` 
        }
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
    { text: 'Uygulama Sağlık Durumu Nasıl? 🏥', prompt: 'Netmera uygulamamın genel sağlık durumunu ve aktif cihaz istatistiklerini kontrol et.' },
    { text: 'Son Kampanyaların Raporları? 📈', prompt: 'Son gönderilen kampanyaların genel delivery ve tıklanma istatistiklerini getir.' },
    { text: 'VIP Segment Durumu 💎', prompt: 'VIP segmentinde kaç kullanıcı var ve bu kullanıcıların son durumu nedir?' },
    { text: 'Funnel Raporlarını Listele 📂', prompt: 'Netmera panelindeki funnel raporlarını listele ve en son verileri göster.' }
  ];

  // A helper function to parse markdown-like table text and render as React Native components
  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    let insideTable = false;
    let tableRows: string[][] = [];

    return lines.map((line, idx) => {
      // Check if it's a table row
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        insideTable = true;
        // Skip separator line (e.g. |---|---|)
        if (line.includes('---')) return null;
        
        const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        tableRows.push(cells);
        
        // If the next line is not a table row, render the table
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
                      backgroundColor: rIdx === 0 ? colors.accentLight : 'transparent'
                    }
                  ]}
                >
                  {row.map((cell, cIdx) => (
                    <Text 
                      key={`cell-${cIdx}`} 
                      style={[
                        styles.tableCell, 
                        { 
                          color: colors.text, 
                          fontWeight: rIdx === 0 ? '700' : '400',
                          fontSize: 12
                        }
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

      // Handle Bullet points
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const bulletText = line.trim().substring(2);
        return (
          <View key={idx} style={styles.bulletRow}>
            <Text style={[styles.bulletDot, { color: colors.accent }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.text }]}>{bulletText}</Text>
          </View>
        );
      }

      // Handle standard text (supporting bold parsing **text**)
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
          <Text style={[styles.emptyIcon, { color: colors.accent }]}>✨</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Netmera AI Agent</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            AI Agent'ın Netmera MCP Server üzerinden verilerinizi yorumlayabilmesi için önce API anahtarlarınızı girmeniz gerekmektedir.
          </Text>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.accent }]}
            onPress={() => router.navigate('/settings')}
          >
            <Text style={styles.actionButtonText}>Ayarlar'a Git</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header Status Bar */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleContainer}>
            <View style={[styles.statusDot, { backgroundColor: loading ? colors.orange : colors.green }]} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>Netmera AI Agent</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {messages.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setMessages([]);
                  setCurrentSessionId(null);
                }}
              >
                <Text style={[styles.headerSubtitle, { color: colors.accent }]}>+ Yeni</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push('/chat-history')}>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>📋 Geçmiş</Text>
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
              <Text style={styles.welcomeEmoji}>🤖</Text>
              <Text style={[styles.welcomeTitle, { color: colors.text }]}>Netmera Yapay Zeka Asistanı</Text>
              <Text style={[styles.welcomeDesc, { color: colors.textSecondary }]}>
                Uygulamanın sağlık durumunu, aktif kullanıcı segmentlerini, anlık raporları ve kampanya verilerini canlı olarak sorgulayabilirim.
              </Text>
              
              <Text style={[styles.quickTitle, { color: colors.textSecondary }]}>Hızlı Sorular:</Text>
              {quickPrompts.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.quickPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => handleSend(item.prompt)}
                >
                  <Text style={[styles.quickPillText, { color: colors.accent }]}>{item.text}</Text>
                </TouchableOpacity>
              ))}
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
                        ? [styles.userBubble, { backgroundColor: colors.accent }] 
                        : [styles.modelBubble, { backgroundColor: colors.surface, borderColor: colors.border }]
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

        {/* Action Status Indicator */}
        {loading && (
          <View style={[styles.statusIndicator, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.text }]}>{statusMessage}</Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={[styles.inputContainer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Bir soru sorun..."
            placeholderTextColor={colors.textTertiary}
            editable={!loading}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton, 
              { backgroundColor: inputText.trim() && !loading ? colors.accent : colors.border }
            ]}
            onPress={() => handleSend(inputText)}
            disabled={!inputText.trim() || loading}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>

        {/* Tool Call Detail Sheet (iOS native pageSheet) */}
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
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageList: {
    padding: 20,
    paddingBottom: 40,
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
    padding: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  userMessageText: {
    color: '#fff',
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
    padding: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    marginRight: 12,
  },
  sendButton: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 10,
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  quickTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    alignSelf: 'flex-start',
    marginBottom: 12,
    marginLeft: 4,
  },
  quickPill: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  quickPillText: {
    fontSize: 14,
    fontWeight: '600',
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
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
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
        }
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.toolPillContent}>
        <View style={[styles.statusIndicatorCircle, { backgroundColor: hasError ? '#ef4444' : '#10b981' }]} />
        <Text style={[styles.toolPillText, { color: colors.text }]}>
          {call.name}
        </Text>
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

const ToolCallDetailSheet: React.FC<ToolCallDetailSheetProps> = ({ call, colors, isDark, onClose }) => {
  const hasError = !!call.error;

  return (
    <SafeAreaView style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
        <View style={styles.sheetHeaderTitleContainer}>
          <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
            {call.name}
          </Text>
          <View 
            style={[
              styles.sheetBadge, 
              { backgroundColor: hasError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }
            ]}
          >
            <Text style={[styles.sheetBadgeText, { color: hasError ? '#ef4444' : '#10b981' }]}>
              {hasError ? 'Hata' : 'Başarılı'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={[styles.sheetCloseBtn, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sheetCloseBtnText, { color: colors.textSecondary }]}>Kapat</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.sheetScroll} 
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Error Info if any */}
        {hasError && (
          <View style={[styles.errorBox, { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }]}>
            <Text style={styles.errorBoxTitle}>Hata Detayı</Text>
            <Text style={[styles.errorBoxText, { color: colors.text }]}>{call.error}</Text>
          </View>
        )}

        {/* Arguments Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Girdi Parametreleri (Arguments)</Text>
        <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 20 }]}>
          <Text style={[styles.codeText, { color: colors.text }]}>
            {JSON.stringify(call.args, null, 2)}
          </Text>
        </View>

        {/* Response Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Sunucu Yanıtı (Response)</Text>
        <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.codeText, { color: colors.text }]}>
            {typeof call.response === 'string' 
              ? call.response 
              : JSON.stringify(call.response, null, 2)}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
