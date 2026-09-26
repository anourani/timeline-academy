import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PopupShell } from '@/components/ui/PopupShell';
import { glassButtonClass, primaryGlassButtonClass } from '@/components/ui/glassButton';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { useAuth } from '../../hooks/useAuth';
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

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * The palette as overlapping discs — the sign-in card's only ornament, and the
 * same mark the Categories legend trigger carries. Ringed in the surface
 * colour so the discs read as separate.
 */
function CategoryDots({ ring }: { ring: string }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {DEFAULT_CATEGORIES.map((cat, i) => (
        <span
          key={cat.id}
          className="size-[8px] shrink-0 rounded-full"
          style={{
            backgroundColor: cat.color,
            boxShadow: `0 0 0 1px ${ring}`,
            marginLeft: i === 0 ? 0 : -2,
          }}
        />
      ))}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
  // Bumped whenever the entered code is no longer usable (failed attempt, new
  // code sent). Used as OtpInput's key so it remounts with empty boxes —
  // otherwise stale digits linger and get submitted alongside the new ones.
  const [otpAttempt, setOtpAttempt] = useState(0);
  // The boxes' red state: set by a rejected code, cleared by the next keystroke.
  const [otpError, setOtpError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { signInWithEmail, verifyEmailOtp } = useAuth();
  const isMobile = useIsMobile();

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
      setOtpAttempt(0);
      setOtpError(false);
      setIsVerifying(false);
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
      <PopupShell
        open={isOpen}
        onOpenChange={(open) => { if (!open) onClose(); }}
        title="Connect to Supabase"
        description="To enable authentication and data persistence, you need to connect your Supabase project."
      >
        <p className="body-m text-[#9B9EA3] m-0">
          Click the "Connect to Supabase" button in the top right corner to get started.
        </p>
      </PopupShell>
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
    setMessage('');
    setIsLoading(true);
    setIsVerifying(true);

    try {
      await verifyEmailOtp(email, code);
      onClose();
    } catch (err) {
      console.error('Email OTP verification error:', err);
      setError(mapErrorMessage(err));
      setOtpError(true);
      // Clear the boxes so the next code is typed into an empty field.
      setOtpAttempt((n) => n + 1);
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setOtpError(false);
    setIsLoading(true);

    try {
      await signInWithEmail(email);
      setMessage('A new code has been sent.');
      // The previous code is now dead — don't leave its digits on screen.
      setOtpAttempt((n) => n + 1);
      startCooldown();
    } catch (err) {
      console.error('Resend email OTP error:', err);
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpInput = () => {
    if (!otpError) return;
    setOtpError(false);
    setError(null);
  };

  const handleBackToEmail = () => {
    setOtpStep('email_entry');
    setError(null);
    setMessage('');
    setOtpError(false);
  };

  // One line under the field for whatever the last action said. Errors keep
  // their hint and, when it could be the network, the connection test.
  const statusLine = (extraClass = '') => {
    if (isVerifying) {
      return (
        <p className={cn('m-0 text-[13px] leading-[18px] text-[#9B9EA3]', extraClass)} aria-live="polite">
          Verifying…
        </p>
      );
    }
    if (error) {
      return (
        <div className={cn('flex flex-col gap-1 text-[13px] leading-[18px]', extraClass)} role="alert" aria-live="polite">
          <p className="m-0 text-[#E06A6A]">{error.message}</p>
          {error.hint && <p className="m-0 text-[#6D7073]">{error.hint}</p>}
          {error.isRetryable && (
            <button
              type="button"
              onClick={handleRetryConnection}
              className="self-start text-[13px] text-[#C9CED4] underline hover:text-[#DADEE5] disabled:opacity-50"
              disabled={isLoading}
            >
              Test connection
            </button>
          )}
        </div>
      );
    }
    if (message) {
      return (
        <p className={cn('m-0 text-[13px] leading-[18px] text-[#9B9EA3]', extraClass)} aria-live="polite">
          {message}
        </p>
      );
    }
    return null;
  };

  const legal = (
    <p className={cn('m-0 text-[12px] leading-[18px] text-[#6D7073]', isMobile && 'text-center')}>
      By continuing you agree to our{' '}
      <Link to="/terms" target="_blank" className="underline hover:text-[#9B9EA3]">
        Terms
      </Link>{' '}
      and{' '}
      <Link to="/privacy" target="_blank" className="underline hover:text-[#9B9EA3]">
        Privacy Policy
      </Link>
      .
    </p>
  );

  const sendLabel = isLoading ? <><Spinner /> Sending…</> : 'Send code';

  const emailInput = (extraClass: string) => (
    <input
      type="email"
      aria-label="Email"
      placeholder="you@example.com"
      autoFocus
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      className={cn('min-w-0 bg-transparent outline-none text-[#DADEE5] placeholder:text-[#6D7073]', extraClass)}
      required
      disabled={isLoading}
    />
  );

  const emailStep = isMobile ? (
    <form onSubmit={handleSendEmailOtp} className="flex flex-1 flex-col">
      <div className="flex h-[52px] items-center rounded-[12px] bg-[#0A0A0A] border border-[#404040] px-3.5 transition-colors focus-within:border-[rgba(37,99,235,0.8)] focus-within:ring-1 focus-within:ring-[rgba(37,99,235,0.8)]">
        {/* 16px keeps iOS from zooming the page on focus. */}
        {emailInput('flex-1 text-[16px]')}
      </div>
      {statusLine('mt-2')}
      <div className="min-h-6 flex-1" aria-hidden />
      <button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className={cn(primaryGlassButtonClass, 'w-full h-[52px] rounded-[12px] text-[16px] inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70')}
      >
        {sendLabel}
      </button>
      <div className="mt-3">{legal}</div>
    </form>
  ) : (
    <form onSubmit={handleSendEmailOtp} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex h-11 items-center gap-2 rounded-[10px] bg-[#0A0A0A] border border-[#404040] pl-3.5 pr-1 transition-colors focus-within:border-[rgba(37,99,235,0.8)] focus-within:ring-1 focus-within:ring-[rgba(37,99,235,0.8)]">
          {emailInput('flex-1 text-[15px]')}
          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className={cn(primaryGlassButtonClass, 'h-[34px] px-3.5 py-0 rounded-[8px] min-w-0 shrink-0 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70')}
          >
            {sendLabel}
          </button>
        </div>
        {statusLine()}
      </div>
      {legal}
    </form>
  );

  const resendArea = resendCooldown > 0 ? (
    <div className="flex flex-col gap-2">
      <div className="h-1 rounded bg-[#262626] overflow-hidden">
        <div
          className="h-full rounded bg-[#404040] transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${(resendCooldown / RESEND_COOLDOWN_SECONDS) * 100}%` }}
        />
      </div>
      <div className="flex justify-between font-['JetBrains_Mono',monospace] text-[11px] uppercase text-[#6D7073]">
        <span>Resend in {formatSeconds(resendCooldown)}</span>
        <span aria-hidden>{formatSeconds(RESEND_COOLDOWN_SECONDS)}</span>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={handleResendEmailOtp}
      disabled={isLoading}
      className={cn(
        glassButtonClass,
        'disabled:opacity-50',
        isMobile ? 'w-full h-[52px] rounded-[12px] text-[16px]' : 'self-start h-[34px] py-0',
      )}
    >
      Resend code
    </button>
  );

  const otpStepBody = (
    <>
      <OtpInput
        key={otpAttempt}
        onComplete={handleVerifyEmailOtp}
        disabled={isLoading}
        error={otpError}
        onInput={handleOtpInput}
      />
      {statusLine('-mt-2')}
      {isMobile && <div className="flex-1" aria-hidden />}
      {resendArea}
    </>
  );

  const backToEmail = (
    <button
      type="button"
      onClick={handleBackToEmail}
      disabled={isLoading}
      aria-label={`Use a different email (currently ${email})`}
      className="-ml-1 flex min-h-[44px] md:min-h-0 min-w-0 items-center gap-1.5 rounded px-1 text-[13px] text-[#9B9EA3] transition-colors hover:text-[#DADEE5] disabled:opacity-50 outline-none focus-visible:ring-1 focus-visible:ring-white/40"
    >
      <ArrowLeft size={14} strokeWidth={1.5} className="shrink-0" />
      <span className="truncate">{email}</span>
    </button>
  );

  const isOtp = otpStep === 'otp_verify';

  return (
    <PopupShell
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      tall
      title={isOtp ? 'Check your inbox' : 'Keep your timelines'}
      description={isOtp ? 'Enter the 6-digit code we just sent.' : 'Sign in to save and open them from anywhere.'}
      topSlot={isOtp ? backToEmail : <CategoryDots ring={isMobile ? '#171717' : '#0A0A0A'} />}
    >
      {isOtp ? otpStepBody : emailStep}
    </PopupShell>
  );
}
