import React, { useRef, useEffect, useState, KeyboardEvent, ClipboardEvent } from 'react';
import { DEFAULT_CATEGORIES } from '@/constants/categories';

interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
  /** Paints every box as failed — set after a rejected code. */
  error?: boolean;
  /** Fires on every edit, so the owner can clear `error` once the user types. */
  onInput?: () => void;
}

// A filled box takes a category colour by position, cycling — the same palette
// the timeline itself is drawn in.
const ACCENT_COLORS = DEFAULT_CATEGORIES.map(c => c.color);
const ERROR_ACCENT = '#AD2929';

export function OtpInput({ length = 6, onComplete, disabled = false, error = false, onInput }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const valuesRef = useRef<string[]>(Array(length).fill(''));
  // The values themselves stay in the ref (the key and paste logic writes the
  // DOM directly); this mirrors only which boxes hold a digit, for styling.
  const [filled, setFilled] = useState<boolean[]>(() => Array(length).fill(false));
  const syncFilled = () => {
    setFilled(valuesRef.current.map(Boolean));
    onInput?.();
  };

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  // Submitting the same six digits twice would burn a second verification
  // attempt against a token the first attempt already consumed, so each
  // distinct code is only ever submitted once per mount.
  const lastSubmittedRef = useRef<string | null>(null);

  const triggerComplete = (values: string[]) => {
    const code = values.join('');
    if (code.length === length && code !== lastSubmittedRef.current) {
      lastSubmittedRef.current = code;
      onComplete(code);
    }
  };

  const handleChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    valuesRef.current[index] = digit;

    const input = inputRefs.current[index];
    if (input) input.value = digit;

    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    syncFilled();
    triggerComplete(valuesRef.current);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (valuesRef.current[index]) {
        valuesRef.current[index] = '';
        const input = inputRefs.current[index];
        if (input) input.value = '';
      } else if (index > 0) {
        valuesRef.current[index - 1] = '';
        const prevInput = inputRefs.current[index - 1];
        if (prevInput) {
          prevInput.value = '';
          prevInput.focus();
        }
      }
      e.preventDefault();
      syncFilled();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    const digits = pasted.split('');
    digits.forEach((digit, i) => {
      valuesRef.current[i] = digit;
      const input = inputRefs.current[i];
      if (input) input.value = digit;
    });

    // Focus the next empty input or the last one
    const nextIndex = Math.min(digits.length, length - 1);
    inputRefs.current[nextIndex]?.focus();

    syncFilled();
    triggerComplete(valuesRef.current);
  };

  return (
    <div className={`flex gap-1.5 md:gap-2 transition-opacity ${disabled ? 'opacity-50' : ''}`}>
      {Array.from({ length }, (_, i) => {
        const border = error
          ? 'border-[rgba(173,41,41,0.8)] focus:ring-1 focus:ring-[rgba(173,41,41,0.8)]'
          : `${filled[i] ? 'border-[#404040]' : 'border-[#262626]'} focus:border-[rgba(37,99,235,0.8)] focus:ring-1 focus:ring-[rgba(37,99,235,0.8)]`;
        const accent = error ? ERROR_ACCENT : filled[i] ? ACCENT_COLORS[i % ACCENT_COLORS.length] : 'transparent';
        return (
          // An <input> can't hold children, so the accent bar is a sibling.
          <div key={i} className="relative min-w-0 flex-1">
            <input
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              disabled={disabled}
              className={`block w-full h-[58px] md:h-16 rounded-[10px] bg-[#0A0A0A] border text-center font-['JetBrains_Mono',monospace] text-[22px] md:text-[24px] text-[#DADEE5] outline-none caret-[rgba(37,99,235,0.8)] transition-colors ${border}`}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              aria-label={`Digit ${i + 1} of ${length}`}
              aria-invalid={error || undefined}
            />
            <span
              className="pointer-events-none absolute left-2 right-2 bottom-[7px] md:left-2.5 md:right-2.5 md:bottom-2 h-[3px] rounded-sm transition-colors"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          </div>
        );
      })}
    </div>
  );
}
