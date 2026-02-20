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
  const { client } = useSupabase();

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

  // ✅ 인증 초기화 (무한로딩 방지 버전)
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        if (!client) {
          if (mounted) setLoading(false);
          return;
        }

        const { data } = await client.auth.getSession();

        if (!mounted) return;

        if (data.session?.user) {
          const profile = await getProfile(client, data.session.user.id);

          if (profile) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.usage_count,
              email: profile.email,
              userId: data.session.user.id,
              isPro: profile.is_pro || false,
            });

            setUsageInfo({
              daily: profile.daily_usage ?? 0,
              monthly: profile.monthly_usage ?? 0,
              dailyLimit: profile.is_pro ? 100 : 10,
              monthlyLimit: profile.is_pro ? 3000 : 200,
            });
          }
        } else {
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
        }
      } catch (err) {
        setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
      }

      if (mounted) setLoading(false);
    };

    initAuth();

    if (!client) return;

    const { data: { subscription } } =
      client.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;

        if (session?.user) {
          const profile = await getProfile(client, session.user.id);

          if (profile) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.usage_count,
              email: profile.email,
              userId: session.user.id,
              isPro: profile.is_pro || false,
            });
          }
        } else {
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
          setUsageInfo(null);
        }
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const handleProcess = useCallback(async (text: string) => {
    if (!client) return;

    setError(null);
    setResult(null);

    if (!user.isLoggedIn) {
      const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
      const usage = parseInt(localStorage.getItem(todayKey) || '0');

      if (usage >= ANONYMOUS_DAILY_LIMIT) {
        setStep('recharge');
        return;
      }
    }

    if (user.isLoggedIn && usageInfo) {
      if (usageInfo.daily >= usageInfo.dailyLimit) {
        setError(`Daily limit exceeded (${usageInfo.daily}/${usageInfo.dailyLimit}).`);
        if (!user.isPro) setStep('recharge');
        return;
      }
    }

    setInput(text);
    setStep('processing');

    try {
      const data = await analyzeText(client, text);

      if (data) {
        setResult(data);
        setStep('result');

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
        } else {
          const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
          const usage = parseInt(localStorage.getItem(todayKey) || '0');
          localStorage.setItem(todayKey, (usage + 1).toString());
        }
      }
    } catch (err) {
      setError('Analysis failed');
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
    setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
    setUsageInfo(null);
    setStep('input');
  };

  // ✅ 로딩 화면 (절대 멈추지 않음)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen text-gray-900 font-sans bg-white">
        {step === 'input' && <Landing onProcess={handleProcess} />}

        {step === 'processing' && <Loading />}

        {step === 'result' && result && (
          <ResultView
            input={input}
            result={result}
            onReset={handleReset}
          />
        )}

        {step === 'login' && (
          <LoginPage
            onLoginSuccess={() => setStep('input')}
            onBack={() => setStep('input')}
          />
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
            onSuccess={() => setStep('input')}
            onCancel={() => setStep('recharge')}
          />
        )}
      </div>
    </PayPalScriptProvider>
  );
};

export default App;