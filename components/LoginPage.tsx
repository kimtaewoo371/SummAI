import React, { useState } from 'react';
// 🔥 핵심: Supabase client 인스턴스 확보를 위한 훅 임포트
import { useSupabase } from  '../components/providers.tsx/SupabaseProvider'; 
import { signin, signup } from "../services/supabaseClient";

interface LoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onBack }) => {
  // 🔥 핵심: Context로부터 client 추출
  const { client } = useSupabase();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // 🛡️ 시스템 미준비 시 가드 로직
    if (!client) {
      setError('System is initializing. Please try again in a moment.');
      return;
    }

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // 🔥 수정: 첫 번째 인자로 client를 반드시 전달해야 함
        await signup(client, email, password);
        setSuccess('Account created! Please check your email to verify your account.');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setIsSignUp(false);
      } else {
        // 🔥 수정: 첫 번째 인자로 client를 반드시 전달해야 함
        await signin(client, email, password);
        setSuccess('Login successful!');
        setTimeout(() => {
          onLoginSuccess();
        }, 500);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-10 shadow-sm">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-gray-500 text-sm font-medium">
            {isSignUp ? 'Get started with unlimited executive insights.' : 'Log in to manage your professional reports.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs font-bold text-red-600 uppercase tracking-widest">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-xs font-bold text-green-600 uppercase tracking-widest">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>
          {isSignUp && (
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white p-5 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-gray-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Continue')}
          </button>
        </form>

        <div className="mt-8 text-center space-y-4">
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setSuccess(null);
            }}
            className="text-xs font-bold text-gray-400 hover:text-black transition-colors"
            disabled={loading}
          >
            {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
          </button>
          <div className="pt-4 border-t border-gray-50">
            <button 
              onClick={onBack} 
              className="text-[10px] font-bold text-gray-300 hover:text-gray-500 uppercase tracking-[0.2em] transition-colors"
              disabled={loading}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;