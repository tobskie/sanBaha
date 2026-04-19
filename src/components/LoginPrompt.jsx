import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginPrompt = () => {
  const { login, showLoginPrompt, setShowLoginPrompt } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setShowLoginPrompt(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setShowLoginPrompt]);

  if (!showLoginPrompt) return null;

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await login();
    } catch (err) {
      setError('Sign-in failed. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[3000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => setShowLoginPrompt(false)}
      />
      <div className="relative glass-card rounded-2xl w-full max-w-sm overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-[#00d4ff]/10 flex items-center justify-between">
          <h2 className="font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Sign In Required
          </h2>
          <button
            onClick={() => setShowLoginPrompt(false)}
            className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Icon */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#00d4ff]/20 to-[#00ff88]/20 border border-[#00d4ff]/20 flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-lg">Navigate with sanBaha</h3>
            <p className="text-slate-400 text-xs mt-1">
              Sign in to unlock navigation, save destinations, and report floods.
            </p>
          </div>

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-white text-gray-800 font-semibold text-sm flex items-center justify-center gap-3 hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {isLoading ? 'Signing in...' : 'Continue with Google'}
          </button>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          {/* Skip */}
          <button
            onClick={() => setShowLoginPrompt(false)}
            className="w-full py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors"
          >
            Maybe later — continue browsing
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPrompt;
