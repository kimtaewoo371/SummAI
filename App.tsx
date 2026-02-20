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
    let mounted = true;

    const init = async () => {
      if (!client) return;

      try {
        const { data: { session } } = await client.auth.getSession();

        if (session?.user && mounted) {
          const profile = await getProfile(client, session.user.id);
          if (profile && mounted) {
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
      } catch (e) {
        console.error("Auth error:", e);
      } finally {
        if (mounted) {
          setLoading(false);
          setAppReady(true);
        }
      }
    };

    if (isReady && client) init();
    return () => { mounted = false; };
  }, [client, isReady]);

  const handleProcess = useCallback(async (text: string) => {
    if (!client) return;

    setError(null);
    setResult(null);

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
      const data = await analyzeText(client, text);
      if (!data) throw new Error("No AI response");

      setResult(data);
      setStep("result");

      if (user.isLoggedIn && user.userId) {
        const updatedProfile = await incrementUsageCount(
          client,
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
      }

    } catch (err: any) {
      console.error("ANALYZE ERROR:", err);
      setError(err.message || "Analysis failed");
      setStep("input");
    }
  }, [user, client]);

  const handleSignOut = async () => {
    if (!client) return;
    await signOut(client);
    setStep("input");
  };

  const remainingDaily = usageInfo
    ? Math.max(0, usageInfo.dailyLimit - usageInfo.daily)
    : null;

  if (!isReady || !client || !appReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="flex min-h-screen bg-white text-gray-900">

        {/* ===== SIDEBAR 복구 ===== */}
        <aside className="w-64 border-r border-gray-100 fixed left-0 top-0 h-screen bg-white z-30">
          <div className="p-6 font-black text-xl">SummAI</div>
          <div className="px-6 space-y-4 text-sm">
            <button onClick={() => setStep("input")} className="block hover:text-black text-gray-500">
              New Analysis
            </button>
            <button onClick={() => setStep("recharge")} className="block hover:text-black text-gray-500">
              Upgrade
            </button>
          </div>
        </aside>

        {/* ===== MAIN AREA ===== */}
        <div className="flex-1 ml-64">

          {/* NAV */}
          <nav className="h-16 border-b border-gray-100 bg-white flex items-center justify-end px-8">
            <div className="flex items-center gap-8">
              {user.isPro && <span className="text-xs font-bold bg-black text-white px-3 py-1 rounded-full">PRO</span>}
              {remainingDaily !== null && <span className="text-xs text-gray-400">{remainingDaily} Left</span>}

              {user.isLoggedIn ? (
                <button onClick={handleSignOut} className="text-xs font-bold">
                  Sign Out
                </button>
              ) : (
                <button onClick={() => setStep("login")} className="text-xs font-bold">
                  Log In
                </button>
              )}
            </div>
          </nav>

          <main className="p-8">
            {error && (
              <div className="mb-6 bg-black text-white px-4 py-2 rounded text-xs font-bold">
                {error}
              </div>
            )}

            {step === 'input' && <Landing onProcess={handleProcess} />}
            {step === 'processing' && <Loading />}
            {step === 'result' && result && <ResultView input={input} result={result} onReset={() => setStep("input")} />}
            {step === 'login' && <LoginPage onLoginSuccess={() => setStep('input')} onBack={() => setStep('input')} />}
            {step === 'recharge' && <RechargePage onBack={() => setStep('input')} onLogin={() => setStep('login')} onUpgrade={() => setStep('payment')} />}
            {step === 'payment' && <PaymentPage userId={user.userId} onSuccess={() => setStep("input")} onCancel={() => setStep('recharge')} />}
          </main>

        </div>
      </div>
    </PayPalScriptProvider>
  );
};

export default App;