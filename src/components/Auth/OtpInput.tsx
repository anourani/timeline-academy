import React, { useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';

interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, onComplete, disabled = false }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const valuesRef = useRef<string[]>(Array(length).fill(''));

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const triggerComplete = (values: string[]) => {
    const code = values.join('');
    if (code.length === length) {
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

    triggerComplete(valuesRef.current);
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          className="w-11 h-13 text-center text-xl font-mono bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          aria-label={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </div>
  );
}
