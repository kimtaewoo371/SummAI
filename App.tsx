import React, { useState, useEffect } from 'react';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

// 1. Types & Services
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

// 3. Provider
import { useSupabase } from './components/providers.tsx/SupabaseProvider';

const ANONYMOUS_DAILY_LIMIT = 10;

const App: React.FC = () => {
  const { client, isReady } = useSupabase();

  const [step, setStep] = useState<AppStep>('input');
  const [input, setInput] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // 초기 로딩

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false
  });

  const paypalOptions = {
    clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "",
    currency: "USD",
    intent: "subscription",
    vault: true,
  };

  // 🔥 핵심: UI를 막지 않는 방어적 인증 로직
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      if (!isReady || !client) return; // 준비 안됐으면 리턴 (나중에 다시 실행됨)

      try {
        const { data: { session } } = await client.auth.getSession();
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
        console.error('Auth Error:', err);
      } finally {
        if (isMounted) setLoading(false); // 로딩 해제 핵심
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
      const res = await analyzeText(client, text);
      setResult(res);
      if (user.userId) {
        await incrementUsageCount(client, user.userId);
        const updated = await getProfile(client, user.userId);
        if (updated) setUser(prev => ({ ...prev, usageCount: updated.usage_count }));
      }
      setStep('result');
    } catch (err: any) {
      if (err.message === 'ANONYMOUS_LIMIT_EXCEEDED') setStep('recharge');
      else { setError(err.message || 'Error'); setStep('input'); }
    }
  };

  const handleReset = () => { setStep('input'); setInput(''); setResult(null); setError(null); };
  const handleLogout = async () => { if (client) { await signOut(client); window.location.reload(); } };

  // 초기 시스템 로딩 UI (UI와 동일한 톤앤매너 유지)
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-10 h-10 border-2 border-gray-100 border-t-black rounded-full animate-spin mb-4" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Initializing System...</p>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions as any}>
      <div className="min-h-screen bg-white">
        {/* Navigation - 원본 디자인 복구 */}
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
                  {user.isPro ? 'PRO PLAN' : `FREE: ${user.usageCount}/${ANONYMOUS_DAILY_LIMIT}`}
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
            <button className="p-2 hover:bg-gray-50 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </nav>

        {/* Main Routing - 당신의 모든 페이지와 사이드바 복구 */}
        <main className="pt-16">
          {step === 'input' && (
            <>
              {error && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-2 rounded-full z-50 text-[10px] font-bold uppercase tracking-widest">
                  {error}
                </div>
              )}
              <Landing onProcess={handleProcess} />
            </>
          )}
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