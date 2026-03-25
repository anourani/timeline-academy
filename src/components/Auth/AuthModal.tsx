import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '../Modal/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { isNetworkError, testConnection, getConnectionStatus } from '../../lib/supabase';
import { OtpInput } from './OtpInput';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type OtpStep = 'email_entry' | 'otp_verify';

const RESEND_COOLDOWN_SECONDS = 60;

interface MappedError {
  message: string;
  isRetryable: boolean;
  hint?: string;
}

function Spinner() {
  return (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function mapErrorMessage(err: unknown): MappedError {
  if (!(err instanceof Error)) return { message: 'An unexpected error occurred.', isRetryable: false };

  const msg = err.message;

  // Network / connection errors
  if (isNetworkError(err)) {
    const status = getConnectionStatus();

    if (!status.ok && status.reason === 'project_paused') {
      return {
        message: 'The server appears to be offline.',
        isRetryable: true,
        hint: 'If using Supabase free tier, your project may be paused due to inactivity. Visit your Supabase dashboard to restore it.',
      };
    }

    if (!status.ok && status.reason === 'auth_config') {
      return {
        message: 'Unable to reach the authentication server.',
        isRetryable: true,
        hint: 'The server URL or API key may be incorrect. Check your environment configuration.',
      };
    }

    return {
      message: 'Unable to connect. Please check your internet connection.',
      isRetryable: true,
      hint: 'If the problem persists, the server may be temporarily unavailable.',
    };
  }

  // Email validation errors
  if (msg.includes('Email address is invalid') || msg.includes('invalid email') || msg.includes('Unable to validate email')) {
    return { message: 'Please enter a valid email address.', isRetryable: false };
  }

  // Email rate limit
  if (msg.includes('Email rate limit exceeded')) {
    return { message: 'Too many attempts. Please try again later.', isRetryable: false };
  }

  // OTP errors
  if (msg.includes('Token has expired') || msg.includes('otp_expired')) {
    return { message: 'Code expired. Please request a new one.', isRetryable: false };
  }
  if (msg.includes('Invalid otp') || msg.includes('invalid token') || msg.includes('Token is invalid')) {
    return { message: 'Incorrect code. Please try again.', isRetryable: false };
  }

  // Rate limiting (generic)
  if (msg.includes('rate limit')) {
    return { message: 'Too many attempts. Please wait a moment and try again.', isRetryable: false };
  }

  return { message: msg, isRetryable: false };
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [error, setError] = useState<MappedError | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('email_entry');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { signInWithEmail, verifyEmailOtp } = useAuth();

  // Clean up cooldown interval
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Reset all state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setMessage('');
      setIsLoading(false);
      setEmail('');
      setOtpStep('email_entry');
      setResendCooldown(0);
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    }
  }, [isOpen]);

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleRetryConnection = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const status = await testConnection();
      if (status.ok) {
        setMessage('Connection restored. Please try again.');
      } else {
        setError({
          message: status.message,
          isRetryable: true,
          hint: status.reason === 'project_paused'
            ? 'Visit your Supabase dashboard to unpause your project.'
            : undefined,
        });
      }
    } catch {
      setError({
        message: 'Still unable to connect.',
        isRetryable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if Supabase is configured
  const isSupabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  if (!isSupabaseConfigured) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Connect to Supabase">
        <div className="space-y-4 text-gray-300">
          <p>To enable authentication and data persistence, you need to connect your Supabase project.</p>
          <p>Click the "Connect to Supabase" button in the top right corner to get started.</p>
        </div>
      </Modal>
    );
  }

  // --- Email OTP handlers ---

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage('');
    setIsLoading(true);

    try {
      await signInWithEmail(email);
      setOtpStep('otp_verify');
      startCooldown();
    } catch (err) {
      console.error('Email OTP error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (code: string) => {
    setError(null);
    setIsLoading(true);

    try {
      await verifyEmailOtp(email, code);
      onClose();
    } catch (err) {
      console.error('Email OTP verification error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setIsLoading(true);

    try {
      await signInWithEmail(email);
      setMessage('A new code has been sent.');
      startCooldown();
    } catch (err) {
      console.error('Resend email OTP error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const title = otpStep === 'otp_verify' ? 'Enter Verification Code' : 'Sign In';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Error display */}
        {error && (
          <div
            className="p-3 bg-red-900/30 border border-red-500 rounded text-red-400"
            role="alert"
            aria-live="polite"
          >
            <p className="font-medium">{error.message}</p>
            {error.hint && (
              <p className="text-xs text-red-400/70 mt-1">{error.hint}</p>
            )}
            {error.isRetryable && (
              <button
                type="button"
                onClick={handleRetryConnection}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline"
                disabled={isLoading}
              >
                Test connection
              </button>
            )}
          </div>
        )}

        {/* Success/info message display */}
        {message && (
          <div
            className="p-3 bg-green-900/30 border border-green-500 rounded text-green-500"
            aria-live="polite"
          >
            {message}
          </div>
        )}

        {/* Email entry */}
        {otpStep === 'email_entry' && (
          <form onSubmit={handleSendEmailOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 rounded-md text-white"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed"
              aria-busy={isLoading}
            >
              {isLoading ? <><Spinner /> Sending Code...</> : 'Send Code'}
            </button>
          </form>
        )}

        {/* OTP verification */}
        {otpStep === 'otp_verify' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 text-center">
              We sent a 6-digit code to <span className="text-white font-medium">{email}</span>
            </p>

            <OtpInput onComplete={handleVerifyEmailOtp} disabled={isLoading} />

            {isLoading && (
              <div className="flex items-center justify-center text-sm text-gray-400">
                <Spinner /> Verifying...
              </div>
            )}

            <div className="flex flex-col items-center gap-2 pt-2">
              <div className="text-sm">
                {resendCooldown > 0 ? (
                  <span className="text-gray-500">Resend code in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendEmailOtp}
                    disabled={isLoading}
                    className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    Resend code
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOtpStep('email_entry');
                  setError(null);
                  setMessage('');
                }}
                className="text-sm text-gray-400 hover:text-gray-300"
                disabled={isLoading}
              >
                Use a different email
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}