import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface AccountDetailsPanelProps {
  onBack: () => void;
}

export function AccountDetailsPanel({ onBack }: AccountDetailsPanelProps) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [hasChanges, setHasChanges] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Track initial values for comparison
  const initialName = user?.user_metadata?.name || '';
  const initialEmail = user?.email || '';

  useEffect(() => {
    const nameChanged = name !== initialName;
    const emailChanged = email !== initialEmail;
    setHasChanges(nameChanged || emailChanged);
  }, [name, email, initialName, initialEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    try {
      // Update user metadata (name)
      if (name !== initialName) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { name }
        });
        if (metadataError) throw metadataError;
      }

      // Update email if changed
      if (email !== initialEmail) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email
        });
        if (emailError) throw emailError;
      }

      // Show success message
      setShowSuccess(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      
      // Reset changes state
      setHasChanges(false);
    } catch (error) {
      console.error('Error updating account:', error);
      alert('Failed to update account details');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-gray-700">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-4 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-6">Account Details</h2>
          
          {showSuccess && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-500 rounded text-green-500 flex items-center gap-2">
              <Check size={16} />
              Account details updated successfully
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-gray-700 rounded-md text-white"
                />
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-gray-700 rounded-md text-white"
                />
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!hasChanges || isLoading}
            className={`px-4 py-2 rounded-md transition-colors ${
              hasChanges && !isLoading
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}