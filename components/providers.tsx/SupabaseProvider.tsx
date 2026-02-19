import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

interface SupabaseContextType {
  client: SupabaseClient | null;
  isReady: boolean;
  error: string | null;
}

const SupabaseContext = createContext<SupabaseContextType>({
  client: null,
  isReady: false,
  error: null,
});

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within SupabaseProvider');
  }
  return context;
};

interface SupabaseProviderProps {
  children: ReactNode;
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({ children }) => {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🔍 SupabaseProvider useEffect started');
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    console.log('🔍 Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      urlPreview: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING'
    });

    // 🔥 환경변수 검증
    if (!supabaseUrl || !supabaseAnonKey) {
      const missing = [];
      if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
      if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
      
      const errorMsg = `Missing environment variables: ${missing.join(', ')}`;
      console.error('❌', errorMsg);
      setError(errorMsg);
      setIsReady(false);
      return;
    }

    try {
      console.log('✅ Initializing Supabase client...');
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      setClient(supabaseClient);
      setIsReady(true);
      console.log('✅ Supabase client ready');
    } catch (err) {
      const errorMsg = 'Failed to initialize Supabase client';
      console.error('❌', errorMsg, err);
      setError(errorMsg);
      setIsReady(false);
    }
  }, []);

  // 🔥 환경변수 에러 시 에러 UI 표시
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="max-w-md p-8 bg-white rounded-lg shadow-lg border border-red-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-2xl">!</span>
            </div>
            <h1 className="text-xl font-bold text-red-900">Configuration Error</h1>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <p className="text-sm text-gray-600">
            Please check your environment variables in Vercel Settings
          </p>
        </div>
      </div>
    );
  }

  return (
    <SupabaseContext.Provider value={{ client, isReady, error }}>
      {children}
    </SupabaseContext.Provider>
  );
};