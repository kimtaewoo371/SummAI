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

  const [appReady, setAppReady] = useState(false);

  const [step, setStep] = useState<AppStep>('input');
  const [input, setInput] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [usageInfo, setUsageInfo] = useState<any>(null);

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false,
  });

  /* ---------------- AUTH INIT ---------------- */

  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initAuth = async () => {
      if (!client) return;

      try {
        const { data: { session } } = await client.auth.getSession();

        if (session?.user && isMounted) {
          const profile = await getProfile(client, session.user.id);

          if (profile && isMounted) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.usage_count,
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
        if (isMounted) {
          setLoading(false);
          setAppReady(true);
        }
      }

      const { data } = client.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;

        if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
          const profile = await getProfile(client, session.user.id);

          if (profile && isMounted) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.usage_count,
              email: profile.email,
              userId: session.user.id,
              isPro: profile.is_pro || false,
            });
          }
        }

        if (event === "SIGNED_OUT") {
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
          setUsageInfo(null);
        }
      });

      authSubscription = data.subscription;
    };

    if (isReady && client) initAuth();

    return () => {
      isMounted = false;
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, [client, isReady]);

  /* ⭐⭐⭐ Supabase 준비 대기 (핵심 해결 코드) ⭐⭐⭐ */
  const waitForClient = async (): Promise<any> => {
    return new Promise((resolve) => {
      const check = () => {
        if (client) resolve(client);
        else setTimeout(check, 100);
      };
      check();
    });
  };

  /* ---------------- ANALYZE ---------------- */

  const handleProcess = useCallback(async (text: string) => {
    setError(null);
    setResult(null);

    // ⭐⭐⭐ 핵심: Supabase 준비될때까지 기다림
    const supabase = await waitForClient();

    if (!user.isLoggedIn) {
      const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
      const usage = parseInt(localStorage.getItem(todayKey) || "0");

      if (usage >= ANONYMOUS_DAILY_LIMIT) {
        setStep("recharge");
        return;
      }

      localStorage.setItem(todayKey, String(usage + 1));
    }

    setInput(text);
    setStep("processing");

    try {
      const data = await analyzeText(supabase, text);
      if (!data) throw new Error("No AI response");

      setResult(data);
      setStep("result");

      if (user.isLoggedIn && user.userId) {
        const updatedProfile = await incrementUsageCount(
          supabase,
          user.userId,
          text.length,
          data.resultText?.length || 0,
          0
        );

        setUsageInfo({
          daily: updatedProfile.daily_usage,
          monthly: updatedProfile.monthly_usage,
          dailyLimit: updatedProfile.is_pro ? 100 : 10,
          monthlyLimit: updatedProfile.is_pro ? 3000 : 200,
        });

        setUser(prev => ({ ...prev, usageCount: updatedProfile.daily_usage }));
      }

    } catch (err: any) {
      console.error("ANALYZE ERROR:", err);
      setError(err.message || "Analysis failed");
      setStep("input");
    }

  }, [user, client]);

  /* ---------------- OTHER HANDLERS ---------------- */

  const handleReset = () => {
    setResult(null);
    setInput("");
    setError(null);
    setStep("input");
  };

  const handleSignOut = async () => {
    if (!client) return;
    await signOut(client);
    setStep("input");
  };

  const handlePaymentSuccess = async () => {
    if (client && user.userId) {
      const profile = await getProfile(client, user.userId);
      if (profile) setUser(prev => ({ ...prev, isPro: !!profile.is_pro }));
    }
    setStep("input");
  };

  const remainingDaily = usageInfo
    ? Math.max(0, usageInfo.dailyLimit - usageInfo.daily)
    : !user.isLoggedIn
      ? Math.max(0, ANONYMOUS_DAILY_LIMIT - user.usageCount)
      : null;

  /* ---------------- RENDER ---------------- */

  if (!isReady || !client || !appReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen text-gray-900 font-sans bg-white">

        {/* NAV */}
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
            {remainingDaily !== null && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{remainingDaily} Left</span>}

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
          {step === 'input' && <>
            {error && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-2 rounded-full z-50 text-[10px] font-bold">{error}</div>}
            <Landing onProcess={handleProcess} />
          </>}
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
