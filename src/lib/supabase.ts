import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please connect your Supabase project using the "Connect to Supabase" button.'
  );
}

// --- Network error detection ---

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') || // Safari
    msg === 'fetch'
  );
}

// --- Fetch with retry ---

const MAX_FETCH_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

function resolveHeaders(options: RequestInit): Record<string, string> {
  const raw = options.headers;
  if (!raw) return {};
  if (raw instanceof Headers) return Object.fromEntries(raw.entries());
  if (Array.isArray(raw)) return Object.fromEntries(raw);
  return raw as Record<string, string>;
}

async function fetchWithRetry(
  url: RequestInfo | URL,
  options: RequestInit = {}
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...resolveHeaders(options),
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      return response;
    } catch (error) {
      if (!isNetworkError(error) || attempt === MAX_FETCH_RETRIES) {
        console.error(
          `Supabase fetch error (attempt ${attempt + 1}/${MAX_FETCH_RETRIES + 1}):`,
          error
        );
        throw error;
      }
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `Supabase fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Failed to fetch'); // unreachable, satisfies TS
}

// --- Supabase client ---

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: { 'x-application-name': 'timeline.academy' }
  },
  db: {
    schema: 'public'
  },
  fetch: fetchWithRetry,
});

// --- Connection diagnostics ---

export type ConnectionStatus =
  | { ok: true }
  | { ok: false; reason: 'network' | 'auth_config' | 'project_paused' | 'unknown'; message: string };

let lastConnectionStatus: ConnectionStatus = { ok: true };

export function getConnectionStatus(): ConnectionStatus {
  return lastConnectionStatus;
}

export async function testConnection(): Promise<ConnectionStatus> {
  try {
    const response = await fetchWithRetry(
      `${supabaseUrl}/auth/v1/health`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      lastConnectionStatus = { ok: true };
    } else if (response.status >= 500) {
      lastConnectionStatus = {
        ok: false,
        reason: 'project_paused',
        message: 'The server is not responding. If using Supabase free tier, your project may be paused.',
      };
    } else {
      lastConnectionStatus = {
        ok: false,
        reason: 'auth_config',
        message: `Server responded with status ${response.status}. Check your Supabase URL and anon key.`,
      };
    }
  } catch (error) {
    if (isNetworkError(error)) {
      lastConnectionStatus = {
        ok: false,
        reason: 'network',
        message: 'Cannot reach the server. Check your internet connection, or the Supabase project may be paused.',
      };
    } else {
      lastConnectionStatus = {
        ok: false,
        reason: 'unknown',
        message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!lastConnectionStatus.ok) {
    console.warn('Supabase connection check:', lastConnectionStatus.message);
  }

  return lastConnectionStatus;
}

// Non-blocking initial connection test
testConnection();
