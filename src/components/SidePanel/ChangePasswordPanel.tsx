import React, { useState } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ChangePasswordPanelProps {
  onBack: () => void;
}

export function ChangePasswordPanel({ onBack }: ChangePasswordPanelProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');

      setTimeout(() => {
        onBack();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
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
        <SheetTitle className="text-xl font-semibold">Change Password</SheetTitle>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex-1 p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-500">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-500 rounded text-green-500">
            Password successfully changed!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative mt-1">
              <Input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pl-10"
                required
                minLength={6}
              />
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative mt-1">
              <Input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-10"
                required
                minLength={6}
              />
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </Button>
        </div>
      </form>
    </div>
  );
}
