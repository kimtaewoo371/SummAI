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

  /** ⭐️ 앱 전체 Auth Loading Gate */
  const [appLoading, setAppLoading] = useState(true);

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

  /* =====================================================
     ⭐️ AUTH INITIALIZATION (Race condition 완전 해결)
  ===================================================== */
  useEffect(() => {
    if (!isReady || !client) return;

    let isMounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await client.auth.getSession();

        if (session?.user && isMounted) {
          const profile = await getProfile(client, session.user.id);

          if (profile && isMounted) {
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
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (isMounted) setAppLoading(false);
      }

      /** 로그인 / 로그아웃 감지 */
      const { data } = client.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;

        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          const profile = await getProfile(client, session.user.id);

          if (profile) {
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

        if (event === 'SIGNED_OUT') {
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
          setUsageInfo(null);
        }
      });

      authSubscription = data.subscription;
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, [isReady]);

  /* =====================================================
     분석 처리
  ===================================================== */
  const handleProcess = useCallback(async (text: string) => {
    if (!client) {
      setError("시스템 초기화 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

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

    try {
      const data = await analyzeText(client, text);

      setResult(data);
      setStep('result');

      if (user.isLoggedIn && user.userId) {
        const updated = await incrementUsageCount(
          client,
          user.userId,
          text.length,
          data.resultText?.length || 0,
          0
        );

        setUsageInfo({
          daily: updated.daily_usage,
          monthly: updated.monthly_usage,
          dailyLimit: updated.is_pro ? 100 : 10,
          monthlyLimit: updated.is_pro ? 3000 : 200,
        });

        setUser(prev => ({ ...prev, usageCount: updated.daily_usage }));
      }
    } catch (err: any) {
      console.error(err);
      setError("분석 중 오류가 발생했습니다.");
      setStep('input');
    }
  }, [client, user, usageInfo]);

  const handleReset = () => {
    setResult(null);
    setInput('');
    setError(null);
    setStep('input');
  };

  const handleSignOut = async () => {
    if (!client) return;
    await signOut(client);
    setStep('input');
  };

  /* =====================================================
     ⭐️ AUTH LOADING GATE (가장 중요)
  ===================================================== */
  if (!isReady || appLoading) {
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

        {/* NAV */}
        <nav className="fixed top-0 left-0 right-0 h-16 border-b bg-white flex items-center justify-between px-8">
          <div className="font-black text-lg cursor-pointer" onClick={() => setStep('input')}>
            SummAI
          </div>

          <div className="flex items-center gap-6">
            <span className="text-xs font-bold text-gray-400">
              {remainingDaily} Left Today
            </span>

            {user.isLoggedIn ? (
              <>
                <span className="text-xs text-gray-400">{user.email}</span>
                <button onClick={handleSignOut} className="text-xs font-bold">Sign Out</button>
              </>
            ) : (
              <button onClick={() => setStep('login')} className="text-xs font-bold">Log In</button>
            )}
          </div>
        </nav>

        <main className="pt-16">
          {step === 'input' && <Landing onProcess={handleProcess} />}
          {step === 'processing' && <Loading />}
          {step === 'result' && result && <ResultView input={input} result={result} onReset={handleReset} />}
          {step === 'login' && <LoginPage onLoginSuccess={() => setStep('input')} onBack={() => setStep('input')} />}
          {step === 'recharge' && <RechargePage onBack={() => setStep('input')} onLogin={() => setStep('login')} onUpgrade={() => setStep('payment')} />}
          {step === 'payment' && <PaymentPage userId={user.userId} onSuccess={() => setStep('input')} onCancel={() => setStep('recharge')} />}
        </main>

      </div>
    </PayPalScriptProvider>
  );
};

export default App;
