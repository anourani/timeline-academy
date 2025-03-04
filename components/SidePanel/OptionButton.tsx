import React from 'react';

interface OptionButtonProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
}

export function OptionButton({ 
  label, 
  onClick, 
  icon,
  variant = 'default' 
}: OptionButtonProps) {
  const baseClasses = "w-full flex items-center justify-between px-4 py-3 text-left rounded-md transition-colors";
  const variantClasses = {
    default: "text-white hover:bg-gray-700",
    danger: "text-red-400 hover:bg-red-900/30"
  };

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]}`}
    >
      <span className="text-base">{label}</span>
      <span className={variant === 'danger' ? 'text-red-400' : 'text-gray-400'}>{icon}</span>
    </button>
  );
}