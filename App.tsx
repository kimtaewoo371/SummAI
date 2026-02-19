import React, { useState, useCallback, useEffect } from 'react';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

import { AppStep, AnalysisResult, UserState } from './types';
import Landing from './components/Landing';
import Loading from './components/Loading';
import ResultView from './components/ResultView';
import LoginPage from './components/LoginPage';
import RechargePage from './components/RechargePage';
import PaymentPage from './components/PaymentPage';

import { analyzeText } from './services/geminiService';
import {
  useSupabase,
  getProfile,
  incrementUsageCount,
  signOut
} from './services/supabaseClient';

const ANONYMOUS_DAILY_LIMIT = 10;

const App: React.FC = () => {
  const { client, isReady } = useSupabase();

  const paypalOptions = {
    clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "",
    currency: "USD",
    intent: "subscription",
    vault: true,
  };

  const [step, setStep] = useState<AppStep>('input');
  const [input, setInput] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 초기 로딩 상태
  const [loading, setLoading] = useState<boolean>(true);

  const [usageInfo, setUsageInfo] = useState<{
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
  }>({
    daily: 0,
    monthly: 0,
    dailyLimit: ANONYMOUS_DAILY_LIMIT,
    monthlyLimit: 300,
  });

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false
  });

  // 🔥 [수정] 오직 이 부분만 손댔습니다. try-catch-finally로 무한 로딩 방지.
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      // client 준비 전까지는 아무것도 하지 않음
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

          setUsageInfo(prev => ({
            ...prev,
            daily: profile?.usage_count || 0,
            dailyLimit: profile?.is_pro ? 100 : ANONYMOUS_DAILY_LIMIT
          }));
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        // 🔥 어떤 에러가 나도 로딩 화면을 걷어냅니다.
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => { isMounted = false; };
  }, [isReady, client]);

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
        const updatedProfile = await getProfile(client, user.userId);
        if (updatedProfile) {
          setUser(prev => ({ ...prev, usageCount: updatedProfile.usage_count }));
        }
      }
      
      setStep('result');
    } catch (err: any) {
      console.error('Analysis failed:', err);
      if (err.message === 'ANONYMOUS_LIMIT_EXCEEDED') {
        setStep('recharge');
      } else {
        setError(err.message || '분석 중 오류가 발생했습니다.');
        setStep('input');
      }
    }
  };

  const handleReset = () => {
    setStep('input');
    setInput('');
    setResult(null);
    setError(null);
  };

  const handleLogout = async () => {
    if (!client) return;
    await signOut(client);
    window.location.reload();
  };

  const handlePaymentSuccess = (subscriptionId: string) => {
    console.log('Payment successful:', subscriptionId);
    setStep('input');
    window.location.reload(); 
  };

  // 당신의 원본 로딩 UI
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-10 h-10 border-2 border-gray-100 border-t-black rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Initializing System...</p>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen bg-white">
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
            <LoginPage onLoginSuccess={() => setStep('input')} onBack={() => setStep('input')} />
          )}
          {step === 'recharge' && (
            <RechargePage
              onBack={() => setStep('input')}
              onLogin={() => setStep('login')}
              onUpgrade={() => setStep('payment')}
            />
          )}
          {step === 'payment' && (
            <PaymentPage
              userId={user.userId}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setStep('recharge')}
            />
          )}
        </main>
      </div>
    </PayPalScriptProvider>
  );
};

export default App;