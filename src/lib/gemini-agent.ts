import { GoogleGenerativeAI } from '@google/generative-ai';
import { NetmeraMCPClient } from './mcp-client';

// Gemini API only accepts these schema types
const VALID_GEMINI_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

function mapSchemaType(type: string): string {
  const t = (type ?? '').toLowerCase();
  return VALID_GEMINI_TYPES.has(t) ? t : 'string';
}

/**
 * Recursively sanitizes a JSON Schema for Gemini's strict requirements:
 * - `array` type MUST have `items`
 * - `object` type MUST have `properties` (Gemini rejects empty objects without it)
 * - No `additionalProperties`, `$schema`, `$ref`, `allOf`, `anyOf`, `oneOf`
 * - Null / missing types default to "string"
 * - `required` only valid on object type
 */
function cleanSchema(schema: any, depth = 0): any {
  if (!schema || depth > 8) return { type: 'string' };

  // Handle oneOf / anyOf / allOf by taking the first branch
  const merged = schema.oneOf?.[0] ?? schema.anyOf?.[0] ?? schema.allOf?.[0] ?? schema;

  const rawType = merged.type;
  // Some schemas use arrays for type: ["string", "null"] — take the non-null one
  const typeStr = Array.isArray(rawType)
    ? (rawType.find((t: string) => t !== 'null') ?? 'string')
    : rawType;

  const type = mapSchemaType(typeStr);

  const result: Record<string, any> = {
    type,
    description: merged.description ?? undefined,
  };

  if (type === 'object') {
    const rawProps = merged.properties ?? {};
    const cleanedProps: Record<string, any> = {};
    for (const key of Object.keys(rawProps)) {
      cleanedProps[key] = cleanSchema(rawProps[key], depth + 1);
    }
    // Gemini requires at least one property on object, or omit properties entirely
    if (Object.keys(cleanedProps).length > 0) {
      result.properties = cleanedProps;
    }
    if (merged.required && Array.isArray(merged.required) && merged.required.length > 0) {
      result.required = merged.required;
    }
  }

  if (type === 'array') {
    // Gemini REQUIRES `items` for array types
    result.items = merged.items
      ? cleanSchema(merged.items, depth + 1)
      : { type: 'string' };  // default fallback
  }

  return result;
}export interface ToolCall {
  name: string;
  args: any;
  response: any;
  error?: string;
}

export interface AgentMessage {
  role: 'user' | 'model' | 'system';
  content: string;
  toolCalls?: ToolCall[];
}

export class GeminiNetmeraAgent {
  private genAI: GoogleGenerativeAI;
  private mcpClient: NetmeraMCPClient;
  private modelName = 'gemini-2.5-flash';

  constructor(geminiApiKey: string, netmeraToken: string) {
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
    this.mcpClient = new NetmeraMCPClient(netmeraToken);
  }

  async run(
    prompt: string,
    history: AgentMessage[],
    onUpdate: (status: string) => void
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    // ── Step 1: Connect to MCP server ──────────────────────────────────────
    onUpdate('Netmera MCP sunucusuna bağlanılıyor...');
    try {
      await this.mcpClient.connect();
    } catch (e: any) {
      this.mcpClient.disconnect();
      throw new Error(
        `Netmera MCP bağlantısı kurulamadı.\n\nDetay: ${e.message}\n\nLütfen internet bağlantınızı ve Netmera token'ınızı kontrol edin.`
      );
    }

    // ── Step 2: Fetch available tools ──────────────────────────────────────
    onUpdate('Netmera yetenekleri (tools) alınıyor...');
    let mcpTools;
    try {
      mcpTools = await this.mcpClient.listTools();
    } catch (e: any) {
      this.mcpClient.disconnect();
      throw new Error(`MCP tool listesi alınamadı: ${e.message}`);
    }

    // Map MCP Tools to Gemini Function Declarations
    const functionDeclarations = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: cleanSchema(tool.inputSchema),
    }));

    onUpdate('AI Agent başlatılıyor...');
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      systemInstruction: `Sen Netmera MCP Server tool'larını kullanan akıllı bir asistansın.
Görevin, kullanıcının Netmera üzerindeki verilerini (kullanıcı istatistikleri, kampanya raporları, segmentler, bildirim kanalları vb.) inceleyip yorumlamaktır.
Sana verilen tool'ları kullanarak verileri canlı olarak çek ve kullanıcıya anlaşılır, profesyonel analizler sun.
Soruları yanıtlarken her zaman Türkçe konuş. Raporları anlaşılır tablolar veya listeler halinde sun.`,
    });

    // Map history to Gemini API format
    const geminiHistory = history.map(h => ({
      role: h.role === 'model' ? 'model' as const : 'user' as const,
      parts: [{ text: h.content }]
    }));

    const chat = model.startChat({
      history: geminiHistory
    });

    let result = await chat.sendMessage(prompt);
    let functionCalls = result.response.functionCalls();
    
    // Agent Loop (Handling tool calls recursively)
    let loopCount = 0;
    const maxLoops = 6;
    const toolCalls: ToolCall[] = [];

    while (functionCalls && functionCalls.length > 0 && loopCount < maxLoops) {
      loopCount++;
      const functionResponses = [];

      for (const call of functionCalls) {
        onUpdate(`Netmera üzerinden veri alınıyor: ${call.name}...`);
        
        let toolResult: any = null;
        let errorMsg: string | undefined;
        try {
          toolResult = await this.mcpClient.callTool(call.name, call.args);
          // Convert toolResult array/object to string content for Gemini
          let textResult = '';
          if (Array.isArray(toolResult)) {
            // Some tool outputs have content blocks like [{ type: "text", text: "..." }]
            textResult = toolResult.map(c => c.text || JSON.stringify(c)).join('\n');
          } else {
            textResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          }

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: textResult },
            },
          });
        } catch (e: any) {
          console.error(`Tool ${call.name} execution failed:`, e);
          errorMsg = e.message || 'Tool execution failed';
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: errorMsg },
            },
          });
        }

        toolCalls.push({
          name: call.name,
          args: call.args,
          response: toolResult,
          error: errorMsg,
        });
      }

      onUpdate('Veriler analiz ediliyor...');
      result = await chat.sendMessage(functionResponses);
      functionCalls = result.response.functionCalls();
    }

    this.mcpClient.disconnect();
    return {
      content: result.response.text() || 'Yanıt üretilemedi.',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
