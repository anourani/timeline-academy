import React, { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultIsSignUp?: boolean;
}

export function AuthModal({ isOpen, onClose, defaultIsSignUp = false }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(defaultIsSignUp);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  // Reset state when modal opens or defaultIsSignUp changes
  React.useEffect(() => {
    if (isOpen) {
      setIsSignUp(defaultIsSignUp);
      setIsForgotPassword(false);
      setEmail('');
      setPassword('');
      setError('');
      setMessage('');
      setIsLoading(false);
    }
  }, [isOpen, defaultIsSignUp]);

  // Check if Supabase is configured
  const isSupabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  if (!isSupabaseConfigured) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Connect to Supabase">
        <div className="space-y-4 text-gray-300">
          <p>
            To enable authentication and data persistence, you need to connect your Supabase project.
          </p>
          <p>
            Click the "Connect to Supabase" button in the top right corner to get started.
          </p>
        </div>
      </Modal>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
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
        onClose();
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (err instanceof Error) {
        // Handle specific error cases
        if (err.message.includes('Email not confirmed')) {
          setError('Please check your email to confirm your account before signing in.');
        } else if (err.message.includes('Invalid login credentials')) {
          setError('Invalid email or password.');
        } else if (err.message.includes('Email rate limit exceeded')) {
          setError('Too many attempts. Please try again later.');
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setIsForgotPassword(true);
    setError('');
    setMessage('');
    setPassword('');
  };

  const handleBack = () => {
    setIsForgotPassword(false);
    setError('');
    setMessage('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Sign In')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-500 rounded text-red-500">
            {error}
          </div>
        )}
        
        {message && (
          <div className="p-3 bg-green-900/30 border border-green-500 rounded text-green-500">
            {message}
          </div>
        )}
        
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
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded-md text-white"
              required
              disabled={isLoading}
              minLength={6}
            />
          </div>
        )}

        <div className="flex justify-between items-center pt-4">
          <div className="space-x-4">
            {isForgotPassword ? (
              <button
                type="button"
                onClick={handleBack}
                className="text-blue-400 hover:text-blue-300"
                disabled={isLoading}
              >
                Back to Sign In
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
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
          >
            {isLoading ? (
              isForgotPassword ? 'Sending...' : (isSignUp ? 'Creating...' : 'Signing In...')
            ) : (
              isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Sign In')
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}