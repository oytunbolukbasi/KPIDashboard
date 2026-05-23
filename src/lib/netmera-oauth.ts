import { Linking, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ExpoLinking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MCP_BASE = 'https://ai.netmera.com/ai';
const OAUTH_REGISTER = `${MCP_BASE}/oauth/register`;
const OAUTH_AUTHORIZE = `${MCP_BASE}/oauth/authorize`;
const OAUTH_TOKEN = `${MCP_BASE}/oauth/token`;

const SESSION_STORAGE_KEY = '@netmera_oauth_pending';

// Returns the correct redirect URI for the current environment:
// - Expo Go dev: exp://192.168.x.x:8081/--/oauth/callback
// - Standalone:  kpidashboard://oauth/callback
// - Web:         http://localhost:8081/oauth/callback
function getRedirectUri(): string {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined'
      ? `${window.location.origin}/oauth/callback`
      : 'http://localhost:8081/oauth/callback';
  }
  return ExpoLinking.createURL('oauth/callback');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const arr = bytes;
  for (let i = 0; i < arr.length; i += 3) {
    const a = arr[i], b = arr[i + 1] ?? 0, c = arr[i + 2] ?? 0;
    result +=
      chars[a >> 2] +
      chars[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < arr.length ? chars[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < arr.length ? chars[c & 63] : '=');
  }
  return result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeVerifier(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  return base64url(randomBytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Persistent session store ──────────────────────────────────────────────────
// We persist to AsyncStorage so the codeVerifier+state survive the
// browser round-trip (the browser opens, user logs in, app resumes).

interface PendingAuth {
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  state: string;
}

async function savePendingSession(session: PendingAuth): Promise<void> {
  await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function loadPendingSession(): Promise<PendingAuth | null> {
  const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAuth;
  } catch {
    return null;
  }
}

async function clearPendingSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Step 1: Register a public OAuth client dynamically and open the browser
 * to Netmera's login page.
 */
export async function startNetmeraOAuth(): Promise<void> {
  const redirectUri = getRedirectUri();

  // 1. Dynamic client registration
  const regRes = await fetch(OAUTH_REGISTER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'KPIDashboard',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  if (!regRes.ok) {
    const err = await regRes.text();
    throw new Error(`Client registration failed: ${err}`);
  }

  const { client_id: clientId } = await regRes.json();

  // 2. PKCE
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // 3. State (random, for CSRF protection)
  const stateBytes = await Crypto.getRandomBytesAsync(16);
  const state = base64url(stateBytes);

  // 4. Persist session so it survives the browser round-trip
  await savePendingSession({ codeVerifier, clientId, redirectUri, state });

  // 5. Build authorize URL and open browser
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'mcp:read',
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  const authorizeUrl = `${OAUTH_AUTHORIZE}?${params.toString()}`;
  await Linking.openURL(authorizeUrl);
}

/**
 * Step 2 (route-based): Called from the oauth/callback route with parsed params.
 * Loads the persisted session, verifies state, and exchanges code for token.
 * Returns the access_token string.
 */
export async function handleOAuthParams(code: string, incomingState: string): Promise<string> {
  const session = await loadPendingSession();

  if (!session) {
    throw new Error(
      'OAuth oturumu bulunamadı. Oturum süresi dolmuş olabilir. Lütfen tekrar giriş yapın.'
    );
  }

  if (session.state !== incomingState) {
    await clearPendingSession();
    throw new Error(
      'OAuth state uyuşmuyor. Güvenlik hatası — lütfen tekrar giriş yapın.'
    );
  }

  await clearPendingSession();

  // Token exchange
  const tokenRes = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: session.clientId,
      code,
      redirect_uri: session.redirectUri,
      code_verifier: session.codeVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token alınamadı: ${err}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken: string =
    tokenData.access_token ?? tokenData.token ?? tokenData.id_token;

  if (!accessToken) {
    throw new Error(`Token bulunamadı: ${JSON.stringify(tokenData)}`);
  }

  return accessToken;
}

/**
 * Step 2 (deep-link URL): Called when the app receives the raw callback URL.
 * Parses code + state and delegates to handleOAuthParams.
 */
export async function handleOAuthCallback(url: string): Promise<string> {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');

  if (error) {
    throw new Error(
      `OAuth hatası: ${error}${parsed.searchParams.get('error_description') ? ' — ' + parsed.searchParams.get('error_description') : ''}`
    );
  }
  if (!code || !state) {
    throw new Error('OAuth callback parametreleri eksik (code veya state yok).');
  }

  return handleOAuthParams(code, state);
}
