/**
 * NetmeraMCPClient
 *
 * Implements the MCP Streamable HTTP transport (spec 2024-11-05 / 2025-03-26).
 *
 * Required handshake sequence:
 *   1. POST /mcp  { method: "initialize" }
 *      → Server returns Mcp-Session-Id header + capabilities
 *   2. POST /mcp  { method: "notifications/initialized" }  (notification, no id)
 *      → Server acknowledges; we are now ready to call tools
 *   3. POST /mcp  { method: "tools/list" }
 *   4. POST /mcp  { method: "tools/call", params: { name, arguments } }
 *
 * All requests after step 1 must include the Mcp-Session-Id header.
 */

const MCP_URL = 'https://ai.netmera.com/ai/mcp';
const CONNECT_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`"${label}" işlemi ${ms / 1000}s içinde tamamlanamadı.`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ── Core HTTP sender ──────────────────────────────────────────────────────────

async function sendRequest(
  token: string,
  body: object,
  sessionId: string | null,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<{ sessionId: string | null; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  let res: Response;
  try {
    res = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // Capture session ID from any response
  const newSessionId = res.headers.get('Mcp-Session-Id') ?? sessionId;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const contentType = res.headers.get('content-type') ?? '';

  // Notification responses are often 202 No Content
  if (res.status === 202 || res.status === 204) {
    return { sessionId: newSessionId, data: null };
  }

  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (data?.error) {
      throw new Error(`MCP JSON-RPC error ${data.error.code}: ${data.error.message}`);
    }
    return { sessionId: newSessionId, data };
  }

  // text/event-stream: read all data lines and use the last JSON payload
  if (contentType.includes('text/event-stream')) {
    const raw = await res.text();
    const dataLines = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);

    if (dataLines.length === 0) {
      // No data lines — treat as empty success (e.g. notification ack)
      return { sessionId: newSessionId, data: null };
    }

    const parsed = JSON.parse(dataLines[dataLines.length - 1]);
    if (parsed?.error) {
      throw new Error(`MCP JSON-RPC error ${parsed.error.code}: ${parsed.error.message}`);
    }
    return { sessionId: newSessionId, data: parsed };
  }

  // Unknown content-type — try JSON anyway
  const fallback = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(fallback);
    return { sessionId: newSessionId, data: parsed };
  } catch {
    throw new Error(`Unexpected MCP response (${contentType}): ${fallback.slice(0, 200)}`);
  }
}

// ── Public Client ─────────────────────────────────────────────────────────────

export class NetmeraMCPClient {
  private token: string;
  private sessionId: string | null = null;
  private connected = false;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Performs the MCP initialize handshake:
   *   initialize  →  (capture session id)  →  notifications/initialized
   */
  async connect(): Promise<void> {
    await withTimeout(this._connect(), CONNECT_TIMEOUT_MS, 'MCP bağlantısı');
  }

  private async _connect(): Promise<void> {
    // Step 1: initialize
    const { sessionId, data: initData } = await sendRequest(
      this.token,
      {
        jsonrpc: '2.0',
        id: makeId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { roots: { listChanged: false } },
          clientInfo: { name: 'KPIDashboard', version: '1.0.0' },
        },
      },
      null,
      CONNECT_TIMEOUT_MS,
    );

    this.sessionId = sessionId;
    console.log('[MCP] initialized, sessionId:', sessionId, 'server:', initData?.result?.serverInfo);

    // Step 2: notifications/initialized  (no `id` field → it's a notification)
    await sendRequest(
      this.token,
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
      this.sessionId,
    );

    this.connected = true;
    console.log('[MCP] notifications/initialized sent — ready');
  }

  async listTools(): Promise<MCPTool[]> {
    this._assertConnected();
    const { data } = await sendRequest(
      this.token,
      { jsonrpc: '2.0', id: makeId(), method: 'tools/list', params: {} },
      this.sessionId,
    );
    return data?.result?.tools ?? [];
  }

  async callTool(name: string, args: any): Promise<any> {
    this._assertConnected();
    const { data } = await sendRequest(
      this.token,
      {
        jsonrpc: '2.0',
        id: makeId(),
        method: 'tools/call',
        params: { name, arguments: args },
      },
      this.sessionId,
      REQUEST_TIMEOUT_MS,
    );
    return data?.result?.content ?? data?.result ?? data;
  }

  disconnect(): void {
    this.sessionId = null;
    this.connected = false;
  }

  private _assertConnected(): void {
    if (!this.connected) {
      throw new Error('MCP bağlantısı aktif değil. Önce connect() çağrılmalı.');
    }
  }
}
