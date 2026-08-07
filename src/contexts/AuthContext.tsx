import React, { createContext, useCallback, useEffect, useState } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearAllCachedEvents } from '../services/viewerEventCache';

interface AuthContextType {
  user: User | null;
  /**
   * False until the initial session lookup has answered. `user` is null both
   * before we know and when the user is genuinely signed out, so consumers that
   * branch on signed-in vs signed-out must wait for this — otherwise they run
   * their logged-out path on every full page load.
   */
  authReady: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      // Force clear the session even if the API call fails
      setUser(null);
    } finally {
      // Don't leave a browsing record of viewed shared timelines behind
      // after the account signs out.
      clearAllCachedEvents();
    }
  }, []);

  const handleAuthError = useCallback(async (error: AuthError) => {
    // Handle specific auth errors
    if (error.message.includes('refresh_token_not_found') ||
        error.message.includes('invalid refresh token')) {
      console.warn('Invalid refresh token, signing out user');
      await signOut();
    }
  }, [signOut]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
        handleAuthError(error);
        // Still "ready" — we asked and got an answer, even a failed one.
        // Leaving this false would hang every consumer forever.
        setAuthReady(true);
        return;
      }
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      } else {
        setUser(session?.user ?? null);
      }
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, [handleAuthError]);

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      handleAuthError(error);
      throw error;
    }
  }, [handleAuthError]);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      handleAuthError(error);
      throw error;
    }
  }, [handleAuthError]);

  return (
    <AuthContext.Provider value={{ user, authReady, signInWithEmail, verifyEmailOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
