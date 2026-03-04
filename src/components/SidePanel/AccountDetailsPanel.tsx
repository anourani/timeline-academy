import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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
      if (name !== initialName) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { name }
        });
        if (metadataError) throw metadataError;
      }

      if (email !== initialEmail) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email
        });
        if (emailError) throw emailError;
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
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
      <SheetHeader className="px-6 py-4 border-b">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <SheetTitle className="text-xl font-semibold">Account Details</SheetTitle>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex-1 p-4 space-y-6">
        <div>
          {showSuccess && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-500 rounded text-green-500 flex items-center gap-2">
              <Check size={16} />
              Account details updated successfully
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <div className="relative mt-1">
                <Input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                />
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1">
                <Input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!hasChanges || isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
