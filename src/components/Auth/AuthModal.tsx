import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Modal } from '../Modal/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { OtpInput } from './OtpInput';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultIsSignUp?: boolean;
}

type AuthMethod = 'phone' | 'email';
type OtpStep = 'phone_entry' | 'otp_verify';

const RESEND_COOLDOWN_SECONDS = 60;

function Spinner() {
  return (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function mapErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'An unexpected error occurred';

  const msg = err.message;

  // Network errors
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg === 'fetch') {
    return 'Unable to connect. Please check your internet connection and try again.';
  }

  // Email/password auth errors
  if (msg.includes('Email not confirmed')) {
    return 'Please check your email to confirm your account before signing in.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (msg.includes('Email rate limit exceeded')) {
    return 'Too many attempts. Please try again later.';
  }

  // Phone/OTP errors
  if (msg.includes('Phone number') || msg.includes('Invalid phone') || msg.includes('phone')) {
    return 'Please enter a valid phone number with country code (e.g., +1 555 000 0000).';
  }
  if (msg.includes('Token has expired') || msg.includes('otp_expired')) {
    return 'Code expired. Please request a new one.';
  }
  if (msg.includes('Invalid otp') || msg.includes('invalid token') || msg.includes('Token is invalid')) {
    return 'Incorrect code. Please try again.';
  }

  // Rate limiting (generic)
  if (msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  return msg;
}

export function AuthModal({ isOpen, onClose, defaultIsSignUp = false }: AuthModalProps) {
  // Shared state
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Email/password state
  const [isSignUp, setIsSignUp] = useState(defaultIsSignUp);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('phone_entry');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { signIn, signUp, signInWithPhone, verifyPhoneOtp } = useAuth();

  // Clean up cooldown interval
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Reset all state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAuthMethod('phone');
      setError('');
      setMessage('');
      setIsLoading(false);
      setIsSignUp(defaultIsSignUp);
      setIsForgotPassword(false);
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setSignUpSuccess(false);
      setPhone('');
      setOtpStep('phone_entry');
      setResendCooldown(0);
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    }
  }, [isOpen, defaultIsSignUp]);

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

  const switchAuthMethod = (method: AuthMethod) => {
    setAuthMethod(method);
    setError('');
    setMessage('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSignUpSuccess(false);
    setPhone('');
    setOtpStep('phone_entry');
    setResendCooldown(0);
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
  };

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

  // --- Phone OTP handlers ---

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    // Basic client-side phone validation
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (!cleaned.startsWith('+') || cleaned.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number with country code (e.g., +1 555 000 0000).');
      setIsLoading(false);
      return;
    }

    try {
      await signInWithPhone(cleaned);
      setOtpStep('otp_verify');
      startCooldown();
    } catch (err) {
      console.error('Phone auth error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setError('');
    setIsLoading(true);

    const cleaned = phone.replace(/[\s()-]/g, '');

    try {
      await verifyPhoneOtp(cleaned, code);
      onClose();
    } catch (err) {
      console.error('OTP verification error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setIsLoading(true);

    const cleaned = phone.replace(/[\s()-]/g, '');

    try {
      await signInWithPhone(cleaned);
      setMessage('A new code has been sent.');
      startCooldown();
    } catch (err) {
      console.error('Resend OTP error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Email handlers ---

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      if (isForgotPassword) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
        });

        if (resetError) {
          if (resetError.message.includes('rate limit')) {
            throw new Error('Too many reset attempts. Please try again later.');
          }
          throw resetError;
        }

        setMessage('If an account exists with this email, you will receive password reset instructions.');
        setEmail('');
      } else if (isSignUp) {
        await signUp(email, password);
        setSignUpSuccess(true);
        setMessage('Account created! Check your email to confirm your account.');
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setIsForgotPassword(true);
    setError('');
    setMessage('');
    setPassword('');
    setSignUpSuccess(false);
  };

  const handleBackToSignIn = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    setError('');
    setMessage('');
    setSignUpSuccess(false);
  };

  // --- Determine modal title ---

  let title: string;
  if (authMethod === 'phone') {
    title = otpStep === 'otp_verify' ? 'Enter Verification Code' : 'Sign In with Phone';
  } else if (isForgotPassword) {
    title = 'Reset Password';
  } else if (signUpSuccess) {
    title = 'Check Your Email';
  } else {
    title = isSignUp ? 'Create Account' : 'Sign In';
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Auth method tabs */}
        <div className="flex border-b border-gray-700">
          <button
            type="button"
            onClick={() => switchAuthMethod('phone')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              authMethod === 'phone'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Phone
          </button>
          <button
            type="button"
            onClick={() => switchAuthMethod('email')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              authMethod === 'email'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Email
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div
            className="p-3 bg-red-900/30 border border-red-500 rounded text-red-500"
            role="alert"
            aria-live="polite"
          >
            {error}
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

        {/* ===== Phone OTP Flow ===== */}
        {authMethod === 'phone' && otpStep === 'phone_entry' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 rounded-md text-white"
                placeholder="+1 (555) 000-0000"
                required
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500">Include your country code (e.g., +1 for US)</p>
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

        {authMethod === 'phone' && otpStep === 'otp_verify' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 text-center">
              We sent a 6-digit code to <span className="text-white font-medium">{phone}</span>
            </p>

            <OtpInput onComplete={handleVerifyOtp} disabled={isLoading} />

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
                    onClick={handleResendOtp}
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
                  setOtpStep('phone_entry');
                  setError('');
                  setMessage('');
                }}
                className="text-sm text-gray-400 hover:text-gray-300"
                disabled={isLoading}
              >
                Use a different phone number
              </button>
            </div>
          </div>
        )}

        {/* ===== Email Flow ===== */}
        {authMethod === 'email' && !signUpSuccess && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
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

            {!isForgotPassword && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-gray-700 rounded-md text-white"
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4">
              <div className="space-x-4">
                {isForgotPassword ? (
                  <button
                    type="button"
                    onClick={handleBackToSignIn}
                    className="text-blue-400 hover:text-blue-300"
                    disabled={isLoading}
                  >
                    Back to Sign In
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setError('');
                        setMessage('');
                      }}
                      className="text-blue-400 hover:text-blue-300"
                      disabled={isLoading}
                    >
                      {isSignUp ? 'Already have an account?' : 'Need an account?'}
                    </button>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-blue-400 hover:text-blue-300"
                        disabled={isLoading}
                      >
                        Forgot Password?
                      </button>
                    )}
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed"
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    {isForgotPassword ? 'Sending...' : (isSignUp ? 'Creating...' : 'Signing In...')}
                  </>
                ) : (
                  isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Sign In')
                )}
              </button>
            </div>
          </form>
        )}

        {/* ===== Sign-up success state ===== */}
        {authMethod === 'email' && signUpSuccess && (
          <div className="space-y-4 text-center">
            <p className="text-gray-300">
              We've sent a confirmation link to <span className="text-white font-medium">{email}</span>. Please check your inbox and click the link to activate your account.
            </p>
            <button
              type="button"
              onClick={handleBackToSignIn}
              className="text-blue-400 hover:text-blue-300"
            >
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
