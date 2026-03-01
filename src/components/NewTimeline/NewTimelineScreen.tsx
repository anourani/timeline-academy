import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void;
  onManualCreate: () => void;
  isGenerating: boolean;
  error: string | null;
}

const PLACEHOLDER_NAMES = [
  'Kobe Bryant',
  'Muhammad Ali',
  'Frida Kahlo',
  'Albert Einstein',
  'Marie Curie',
  'Martin Luther King Jr.',
];

export function NewTimelineScreen({
  onAIGenerate,
  onManualCreate,
  isGenerating,
  error,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_NAMES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && !isGenerating) {
      onAIGenerate(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="w-full max-w-xl px-8 text-center">
        <h1 className="text-[40px] leading-[120%] text-[#F3F3F3] font-['Aleo'] font-medium tracking-[-0.01em] mb-10">
          Enter a name.
          <br />
          we build the timeline.
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={PLACEHOLDER_NAMES[placeholderIndex]}
              disabled={isGenerating}
              className="w-full pl-12 pr-4 py-3.5 bg-[#1A1A1A] border border-gray-700 rounded-xl text-white text-base placeholder-gray-500 outline-none focus:border-gray-500 transition-colors disabled:opacity-50"
            />
          </div>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}

        {isGenerating ? (
          <p className="mt-6 text-sm text-gray-400 animate-pulse">
            Building your timeline...
          </p>
        ) : (
          <button
            onClick={onManualCreate}
            className="mt-6 text-sm text-gray-400 hover:text-white underline underline-offset-2 transition-colors"
          >
            Create my own timeline
          </button>
        )}
      </div>
    </div>
  );
}
