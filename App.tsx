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

  const [appLoading, setAppLoading] = useState(true);

  const [usageInfo, setUsageInfo] = useState<any>(null);

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false,
  });

  // ⭐⭐⭐ AUTH INITIALIZATION (FIXED RACE CONDITION)
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

  // ⭐ 분석 실행
  const handleProcess = useCallback(async (text: string) => {
    if (!client) {
      setError("시스템 초기화 중입니다.");
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
      } else {
        const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
        const usage = parseInt(localStorage.getItem(todayKey) || '0');
        localStorage.setItem(todayKey, (usage + 1).toString());
        setUser(prev => ({ ...prev, usageCount: usage + 1 }));
      }

    } catch (err: any) {
      console.error(err);
      setError("분석 실패. 다시 시도해주세요.");
      setStep('input');
    }
  }, [user, client, usageInfo]);

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

  const handlePaymentSuccess = async () => {
    if (!client || !user.userId) return;
    const profile = await getProfile(client, user.userId);
    setUser(prev => ({ ...prev, isPro: !!profile.is_pro }));
    setStep('input');
  };

  if (!isReady || appLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen text-gray-900 font-sans bg-white">

        <nav className="fixed top-0 left-0 right-0 h-16 border-b border-gray-100 bg-white/95 backdrop-blur-sm z-40 flex items-center justify-between px-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep('input')}>
            <span className="font-black text-lg tracking-tight">SummAI</span>
          </div>

          <div className="flex items-center gap-6">
            {user.isLoggedIn ? (
              <>
                <span className="text-xs">{user.email}</span>
                <button onClick={handleSignOut}>Sign Out</button>
              </>
            ) : (
              <button onClick={() => setStep('login')}>Log In</button>
            )}
          </div>
        </nav>

        <main className="pt-16">
          {step === 'input' && <Landing onProcess={handleProcess} />}
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
