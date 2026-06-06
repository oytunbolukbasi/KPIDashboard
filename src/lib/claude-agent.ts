import { NetmeraMCPClient } from './mcp-client';
import { AgentMessage, ToolCall } from './gemini-agent';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `Sen Netmera platformunun tüm yeteneklerini kullanan akıllı bir asistansın. Netmera MCP Server üzerinden aşağıdaki işlemleri (tools) dinamik olarak çağırabilirsin:
1. Analytics & Dashboard: Günlük istatistikler, event trendleri, funnel analizleri, gelir (revenue) ve churn verilerini çekebilirsin (analytics_* ve dashboard_*).
2. Kampanya Yönetimi: Kampanya raporlarını alabilir, yeni draft oluşturabilir, onaylayabilir veya iptal edebilirsin (campaign_*).
3. Otomasyon & Workflow: Otomasyon ve workflow listelerini alıp durumlarını (pause/resume) yönetebilirsin (automation_*, workflow_*).
4. Segment & Etiket (Tag): Kullanıcı segmentleri oluşturabilir, listeyebilir ve etiket (tag) ekleyip silebilirsin (segment_*, tag_*).
5. Kullanıcı (People) & Profil: Kullanıcı profillerini, cihaz bilgilerini, IYS izinlerini (SMS/Email consent) ve event geçmişlerini inceleyebilirsin (people_*, iys_*, profile_attr_*).
6. Geofence & Recommendation: Lokasyon bazlı (geofence) alanlar oluşturabilir, recommendation modellerini listeleyip performanslarını sunabilirsin (geofence_*, recommendation_*).

Kullanıcı bir veri veya işlem istediğinde, öncelikle elindeki tool'ları (fonksiyonları) kullanarak veriyi canlı olarak Netmera'dan çek. Gelen JSON verilerini analiz ederek Türkçe, profesyonel ve anlaşılır bir özet, rapor veya tablo halinde sun. Asla veri uydurma, tamamen tool'lardan gelen yanıtlara sadık kal.`;

// ── Local type definitions (no SDK dependency) ─────────────────────────────

interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock;

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface MessageParam {
  role: 'user' | 'assistant';
  content: string | ContentBlock[] | ToolResultBlock[];
}

interface ClaudeResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
}

// ── API helper ─────────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  model: string,
  tools: ClaudeTool[],
  messages: MessageParam[]
): Promise<ClaudeResponse> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    }),
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {}
    throw new Error(`Claude API hatası (${res.status}): ${message}`);
  }

  return res.json();
}

// ── Agent ───────────────────────────────────────────────────────────────────

export class ClaudeNetmeraAgent {
  private apiKey: string;
  private mcpClient: NetmeraMCPClient;
  private modelName: string;

  constructor(anthropicApiKey: string, netmeraToken: string, modelName = 'claude-opus-4-8') {
    this.apiKey = anthropicApiKey;
    this.mcpClient = new NetmeraMCPClient(netmeraToken);
    this.modelName = modelName;
  }

  async run(
    prompt: string,
    history: AgentMessage[],
    onUpdate: (status: string) => void
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    onUpdate('Netmera MCP sunucusuna bağlanılıyor...');
    try {
      await this.mcpClient.connect();
    } catch (e: any) {
      this.mcpClient.disconnect();
      throw new Error(
        `Netmera MCP bağlantısı kurulamadı.\n\nDetay: ${e.message}\n\nLütfen internet bağlantınızı ve Netmera token'ınızı kontrol edin.`
      );
    }

    onUpdate('Netmera yetenekleri (tools) alınıyor...');
    let mcpTools;
    try {
      mcpTools = await this.mcpClient.listTools();
    } catch (e: any) {
      this.mcpClient.disconnect();
      throw new Error(`MCP tool listesi alınamadı: ${e.message}`);
    }

    const tools: ClaudeTool[] = mcpTools.map((tool) => {
      const schema = tool.inputSchema as any;
      return {
        name: tool.name,
        description: tool.description || '',
        input_schema: {
          type: 'object' as const,
          properties: schema?.properties ?? {},
          ...(schema?.required?.length > 0 ? { required: schema.required } : {}),
        },
      };
    });

    onUpdate('AI Agent başlatılıyor...');

    // Convert history to Claude format ('model' → 'assistant')
    const messages: MessageParam[] = history
      .filter(h => h.role !== 'system')
      .map(h => ({
        role: h.role === 'model' ? 'assistant' as const : 'user' as const,
        content: h.content,
      }));

    messages.push({ role: 'user', content: prompt });

    const allToolCalls: ToolCall[] = [];
    let loopCount = 0;
    const maxLoops = 6;

    while (loopCount < maxLoops) {
      loopCount++;

      const response = await callClaude(this.apiKey, this.modelName, tools, messages);

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        const textBlock = response.content.find(b => b.type === 'text') as TextBlock | undefined;
        this.mcpClient.disconnect();
        return {
          content: textBlock?.text ?? 'Yanıt üretilemedi.',
          toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        };
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });

        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as ToolUseBlock[];
        const toolResults: ToolResultBlock[] = [];

        for (const toolUse of toolUseBlocks) {
          onUpdate(`Netmera üzerinden veri alınıyor: ${toolUse.name}...`);

          let toolResult: any = null;
          let errorMsg: string | undefined;

          try {
            toolResult = await this.mcpClient.callTool(toolUse.name, toolUse.input);
            let textResult = '';
            if (Array.isArray(toolResult)) {
              textResult = toolResult.map(c => c.text ?? JSON.stringify(c)).join('\n');
            } else {
              textResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            }
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: textResult });
          } catch (e: any) {
            errorMsg = e.message || 'Tool execution failed';
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${errorMsg}`,
              is_error: true,
            });
          }

          allToolCalls.push({
            name: toolUse.name,
            args: toolUse.input,
            response: toolResult,
            error: errorMsg,
          });
        }

        onUpdate('Veriler analiz ediliyor...');
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    this.mcpClient.disconnect();
    return {
      content: 'Yanıt üretilemedi.',
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
  }
}
