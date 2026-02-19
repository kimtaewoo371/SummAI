import React, { useState, useEffect } from 'react';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

// 1. Types & Services (경로 확인 필수)
import { AppStep, AnalysisResult, UserState } from './types';
import { analyzeText } from './services/geminiService';
import {
  getProfile,
  incrementUsageCount,
  signOut
} from './services/supabaseClient';

// 2. Components
import Landing from './components/Landing';
import Loading from './components/Loading';
import ResultView from './components/ResultView';
import LoginPage from './components/LoginPage';
import RechargePage from './components/RechargePage';
import PaymentPage from './components/PaymentPage';

// 3. Provider (당신의 폴더명 구조 반영)
import { useSupabase } from './components/providers.tsx/SupabaseProvider';

const ANONYMOUS_DAILY_LIMIT = 10;

const App: React.FC = () => {
  const { client, isReady } = useSupabase();

  // State Management
  const [step, setStep] = useState<AppStep>('input');
  const [input, setInput] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // 초기 진입 로딩

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false
  });

  // PayPal Configuration
  const paypalOptions = {
    clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "",
    currency: "USD",
    intent: "subscription",
    vault: true,
  };

  // 🔥 무한 로딩 해결 및 세션 초기화 로직
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      // Supabase 클라이언트가 준비될 때까지 대기
      if (!isReady || !client) return;

      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;

        if (session && isMounted) {
          const profile = await getProfile(client, session.user.id);
          setUser({
            isLoggedIn: true,
            userId: session.user.id,
            email: session.user.email,
            usageCount: profile?.usage_count || 0,
            isPro: profile?.is_pro || false
          });
        }
      } catch (err) {
        console.error('Auth Init Error:', err);
      } finally {
        if (isMounted) setLoading(false); // 무조건 로딩 해제
      }
    };

    initAuth();

    return () => { isMounted = false; };
  }, [isReady, client]);

  // Handlers
  const handleProcess = async (text: string) => {
    if (!client) return;
    setInput(text);
    setStep('processing');
    setError(null);

    try {
      const analysisResult = await analyzeText(client, text);
      setResult(analysisResult);
      
      if (user.userId) {
        await incrementUsageCount(client, user.userId);
        const updated = await getProfile(client, user.userId);
        if (updated) setUser(prev => ({ ...prev, usageCount: updated.usage_count }));
      }
      setStep('result');
    } catch (err: any) {
      if (err.message === 'ANONYMOUS_LIMIT_EXCEEDED') {
        setStep('recharge');
      } else {
        setError(err.message || 'Error occurred');
        setStep('input');
      }
    }
  };

  const handleLogout = async () => {
    if (client) {
      await signOut(client);
      window.location.reload();
    }
  };

  const handleReset = () => {
    setStep('input');
    setResult(null);
    setError(null);
  };

  // 렌더링 가드: 시스템 초기 로딩
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-100 border-t-black rounded-full animate-spin" />
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">System Initializing</p>
        </div>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions as any}>
      <div className="min-h-screen bg-white font-sans text-gray-900">
        {/* Nav Bar */}
        <nav className="fixed top-0 w-full h-16 border-b border-gray-50 bg-white/80 backdrop-blur-md z-50 flex items-center justify-between px-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xl">S</span>
            </div>
            <span className="font-black text-xl tracking-tighter">SummAI</span>
          </div>

          <div className="flex items-center gap-6">
            {user.isLoggedIn ? (
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {user.isPro ? 'PRO' : `FREE: ${user.usageCount}/${ANONYMOUS_DAILY_LIMIT}`}
                </span>
                <button onClick={handleLogout} className="text-[10px] font-bold uppercase tracking-widest hover:text-red-500 transition-colors">
                  Logout
                </button>
              </div>
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-bold uppercase tracking-widest">
                Login
              </button>
            )}
          </div>
        </nav>

        {/* Main Content */}
        <main className="pt-16">
          {error && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-2 rounded-full z-50 text-[10px] font-bold uppercase tracking-widest">
              {error}
            </div>
          )}

          {step === 'input' && <Landing onProcess={handleProcess} />}
          {step === 'processing' && <Loading />}
          {step === 'result' && result && (
            <ResultView input={input} result={result} onReset={handleReset} />
          )}
          {step === 'login' && (
            <LoginPage onLoginSuccess={() => setStep('input')} onBack={handleReset} />
          )}
          {step === 'recharge' && (
            <RechargePage
              onBack={handleReset}
              onLogin={() => setStep('login')}
              onUpgrade={() => setStep('payment')}
            />
          )}
          {step === 'payment' && (
            <PaymentPage
              userId={user.userId}
              onSuccess={() => window.location.reload()}
              onCancel={() => setStep('recharge')}
            />
          )}
        </main>
      </div>
    </PayPalScriptProvider>
  );
};

export default App;