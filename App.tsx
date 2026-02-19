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
  const [loading, setLoading] = useState<boolean>(true);

  const [usageInfo, setUsageInfo] = useState<{
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
  } | null>(null);

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false,
  });

  // ─── [보강] 인증 및 프로필 로드 (데이터 무결성 확보) ───
  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      if (!client) return;

      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError && sessionError.name !== 'AbortError') throw sessionError;
        
        if (session?.user && isMounted) {
          const profile = await getProfile(client, session.user.id);
          if (isMounted && profile) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.daily_usage || 0,
              email: profile.email,
              userId: session.user.id,
              isPro: profile.is_pro || false,
            });
            setUsageInfo({
              daily: profile.daily_usage ?? 0,
              monthly: profile.monthly_usage ?? 0,
              dailyLimit: profile.is_pro ? 100 : 10,
              monthlyLimit: profile.is_pro ? 3000 : 200,
            });
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') console.error('❌ Auth Error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }

      const { data } = client.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          const profile = await getProfile(client, session.user.id);
          if (isMounted && profile) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.daily_usage || 0,
              email: profile.email,
              userId: session.user.id,
              isPro: profile.is_pro || false,
            });
            setUsageInfo({
              daily: profile.daily_usage ?? 0,
              monthly: profile.monthly_usage ?? 0,
              dailyLimit: profile.is_pro ? 100 : 10,
              monthlyLimit: profile.is_pro ? 3000 : 200,
            });
          }
        } else if (event === 'SIGNED_OUT') {
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
          setUsageInfo(null);
        }
      });
      authSubscription = data.subscription;
    };

    initializeAuth();

    const safetyTimer = setTimeout(() => {
      if (isMounted && loading) setLoading(false);
    }, 5000);

    return () => { 
      isMounted = false; 
      clearTimeout(safetyTimer);
      if (authSubscription) authSubscription.unsubscribe(); 
    };
  }, [client]);

  // ─── [보강] 분석 프로세스 (타임아웃 및 가드 로직) ───
  const handleProcess = useCallback(async (text: string) => {
    if (!client || (user.isLoggedIn && !user.userId)) {
      setError("시스템 초기화 중입니다. 잠시 후 다시 시도하십시오.");
      return;
    }
    
    // 1. 선제적 한도 체크
    const currentUsage = usageInfo?.daily ?? user.usageCount;
    const currentLimit = usageInfo?.dailyLimit ?? ANONYMOUS_DAILY_LIMIT;

    if (currentUsage >= currentLimit) {
      setStep('recharge');
      return;
    }

    setError(null);
    setResult(null);
    setInput(text);
    setStep('processing');

    // 2. 익명 사용자 로컬 체크
    if (!user.isLoggedIn) {
      const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
      const usage = parseInt(localStorage.getItem(todayKey) || '0');
      if (usage >= ANONYMOUS_DAILY_LIMIT) {
        setStep('recharge');
        return;
      }
    }

    try {
      // 3. 분석 실행 (Gemini API)
      const data = await analyzeText(client, text);
      
      if (data && isReady) {
        setResult(data);
        setStep('result');

        // 4. 분석 성공 확정 시에만 사용량 차감 (무결성 원칙)
        if (user.isLoggedIn && user.userId) {
          try {
            const updated = await incrementUsageCount(client, user.userId, text.length, data.resultText?.length || 0, 0);
            setUsageInfo({
              daily: updated.daily_usage,
              monthly: updated.monthly_usage,
              dailyLimit: updated.is_pro ? 100 : 10,
              monthlyLimit: updated.is_pro ? 3000 : 200,
            });
            setUser(prev => ({ ...prev, usageCount: updated.daily_usage }));
          } catch (dbErr: any) {
            console.warn("Usage sync failed but result delivered.");
          }
        } else {
          // 익명 사용자 로컬 카운트 증가
          const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
          const usage = parseInt(localStorage.getItem(todayKey) || '0');
          localStorage.setItem(todayKey, (usage + 1).toString());
          setUser(prev => ({ ...prev, usageCount: usage + 1 }));
        }
      }
    } catch (err: any) {
      console.error("Critical Failure:", err);
      // 특정 에러(한도초과 등) 발생 시 즉시 리차지 유도
      if (err.message?.includes("LIMIT") || err.message?.includes("400")) {
        setStep('recharge');
      } else {
        setError(err.message || '분석 중 오류가 발생했습니다. 다시 시도하십시오.');
        setStep('input');
      }
    }
  }, [user, client, usageInfo, isReady]);

  const handleReset = useCallback(() => {
    setResult(null); setInput(''); setError(null); setStep('input');
  }, []);

  const handleSignOut = async () => {
    if (!client) return;
    try { await signOut(client); setStep('input'); }
    catch (err) { console.error(err); }
  };

  const handlePaymentSuccess = useCallback(async () => {
    setLoading(true);
    if (client && user.userId) {
      const profile = await getProfile(client, user.userId);
      if (profile) {
        setUser(prev => ({ ...prev, isPro: !!profile.is_pro }));
        setUsageInfo({
          daily: profile.daily_usage ?? 0,
          monthly: profile.monthly_usage ?? 0,
          dailyLimit: profile.is_pro ? 100 : 10,
          monthlyLimit: profile.is_pro ? 3000 : 200,
        });
      }
    }
    setLoading(false);
    setStep('input');
  }, [client, user.userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  const remainingDaily = usageInfo
    ? Math.max(0, usageInfo.dailyLimit - usageInfo.daily)
    : Math.max(0, ANONYMOUS_DAILY_LIMIT - user.usageCount);

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen text-gray-900 font-sans bg-white">
        <nav className="fixed top-0 left-0 right-0 h-16 border-b border-gray-100 bg-white/95 backdrop-blur-sm z-40 flex items-center justify-between px-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep('input')}>
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center relative">
              <div className="w-4 h-0.5 bg-white rounded-full rotate-45 translate-y-[-1px]"></div>
              <div className="w-4 h-0.5 bg-white rounded-full -rotate-45 translate-y-[1px] absolute"></div>
            </div>
            <span className="font-black text-lg tracking-tight">SummAI</span>
          </div>
          <div className="flex items-center gap-8">
            {user.isPro && <span className="text-[10px] font-bold bg-black text-white px-3 py-1 rounded-full uppercase">PRO</span>}
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{remainingDaily} Left Today</span>
            {user.isLoggedIn ? (
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold text-gray-400">{user.email}</span>
                <button onClick={handleSignOut} className="text-[10px] font-black uppercase hover:text-black">Sign Out</button>
              </div>
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-black uppercase hover:text-gray-500">Log In</button>
            )}
            <button onClick={() => setStep('recharge')} className="p-2 hover:bg-gray-100 rounded-lg border border-gray-100">
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </nav>

        <main className="pt-16">
          {step === 'input' && (
            <>
              {error && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-2 rounded-full z-50 text-[10px] font-bold shadow-2xl">{error}</div>}
              <Landing onProcess={handleProcess} />
            </>
          )}
          {step === 'processing' && <Loading />}
          {step === 'result' && result && <ResultView input={input} result={result} onReset={handleReset} />}
          {step === 'login' && <LoginPage onLoginSuccess={() => setStep('input')} onBack={() => setStep('input')} />}
          {step === 'recharge' && <RechargePage onBack={() => setStep('input')} onLogin={() => setStep('login')} onUpgrade={() => setStep('payment')} />}
          {step === 'payment' && <PaymentPage userId={user.userId} onSuccess={handlePaymentSuccess} onCancel={() => setStep('recharge')} />}
        </main>
      </div>
    </PayPalScriptProvider>
  );
};

export default App;