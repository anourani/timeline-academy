import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please connect your Supabase project using the "Connect to Supabase" button.'
  );
}

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
  // Add retrying for network issues
  fetch: (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
    }).catch(error => {
      console.error('Supabase fetch error:', error);
      throw error;
    });
  }
});

// Test connection and log status
let connectionTested = false;

export async function testConnection() {
  if (connectionTested) return;
  
  try {
    const { error } = await supabase.from('timelines')
      .select('count', { count: 'exact', head: true });
    
    if (error) throw error;
    // Connection successful
    connectionTested = true;
  } catch (error) {
    console.error('Failed to connect to Supabase:', error);
    connectionTested = false;
    throw error;
  }
}

// Initial connection test
testConnection().catch(() => {
  console.warn('Initial Supabase connection failed - will retry on demand');
});