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
  checkUsageLimit,
  incrementUsageCount,
  signOut
} from './services/supabaseClient';
import { updateUserTimezone } from './utils/timezone';

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
    timezone?: string;
  } | null>(null);

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false,
  });

  // 초기화
  useEffect(() => {
    if (!isReady || !client) return;

    let isMounted = true;
    let authSub: any = null;

    const init = async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        
        if (session?.user && isMounted) {
          updateUserTimezone(client, session.user.id).catch(() => {});
          
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
              timezone: profile.timezone || 'UTC',
            });
          } else if (isMounted) {
            await client.auth.signOut();
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const date = new Date().toLocaleDateString('en-CA');
            const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
            const anon = parseInt(localStorage.getItem(key) || '0');
            setUser({ isLoggedIn: false, usageCount: anon, isPro: false });
          }
        } else if (isMounted) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const date = new Date().toLocaleDateString('en-CA');
          const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
          const anon = parseInt(localStorage.getItem(key) || '0');
          setUser({ isLoggedIn: false, usageCount: anon, isPro: false });
        }
      } catch (err) {
        console.error('Init error:', err);
        if (isMounted) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const date = new Date().toLocaleDateString('en-CA');
          const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
          const anon = parseInt(localStorage.getItem(key) || '0');
          setUser({ isLoggedIn: false, usageCount: anon, isPro: false });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
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
            timezone: profile.timezone || 'UTC',
          });
        }
      } else if (event === 'SIGNED_OUT' && isMounted) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const date = new Date().toLocaleDateString('en-CA');
        const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
        const anon = parseInt(localStorage.getItem(key) || '0');
        setUser({ isLoggedIn: false, usageCount: anon, isPro: false });
        setUsageInfo(null);
      }
    });

    authSub = subscription;

    return () => {
      isMounted = false;
      if (authSub) authSub.unsubscribe();
    };
  }, [isReady, client]);

  const handleProcess = useCallback(async (text: string) => {
    if (!isReady || !client) {
      setError('System initializing...');
      return;
    }

    if (!text.trim()) {
      setError('Please enter text');
      return;
    }

    setError(null);
    setResult(null);

    // 비로그인 제한
    if (!user.isLoggedIn) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const date = new Date().toLocaleDateString('en-CA');
      const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
      const usage = parseInt(localStorage.getItem(key) || '0');
      if (usage >= ANONYMOUS_DAILY_LIMIT) {
        setStep('recharge');
        return;
      }
    }

    // 로그인 제한
    if (user.isLoggedIn && user.userId) {
      try {
        const limitCheck = await checkUsageLimit(client, user.userId);
        
        if (!limitCheck.allowed) {
          const msg = limitCheck.message || `${limitCheck.reason}: ${limitCheck.daily_usage}/${limitCheck.daily_limit}`;
          setError(msg);
          if (!user.isPro) setStep('recharge');
          return;
        }
        
        if (limitCheck.will_reset) {
          setUsageInfo({
            daily: 0,
            monthly: limitCheck.monthly_usage || 0,
            dailyLimit: limitCheck.daily_limit || 10,
            monthlyLimit: limitCheck.monthly_limit || 200,
            timezone: limitCheck.user_timezone || 'UTC',
          });
        } else {
          setUsageInfo({
            daily: limitCheck.daily_usage || 0,
            monthly: limitCheck.monthly_usage || 0,
            dailyLimit: limitCheck.daily_limit || 10,
            monthlyLimit: limitCheck.monthly_limit || 200,
            timezone: limitCheck.user_timezone || 'UTC',
          });
        }
      } catch (err) {
        console.error('Limit check failed:', err);
        setError('Failed to check limit');
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
          const updated = await incrementUsageCount(
            client, user.userId, text.length, data.resultText?.length || 0, 0
          );
          setUsageInfo({
            daily: updated.daily_usage,
            monthly: updated.monthly_usage,
            dailyLimit: updated.is_pro ? 100 : 10,
            monthlyLimit: updated.is_pro ? 3000 : 200,
            timezone: updated.timezone || 'UTC',
          });
          setUser(prev => ({ ...prev, usageCount: updated.daily_usage }));
        } else {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const date = new Date().toLocaleDateString('en-CA');
          const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
          const usage = parseInt(localStorage.getItem(key) || '0');
          localStorage.setItem(key, (usage + 1).toString());
          setUser(prev => ({ ...prev, usageCount: prev.usageCount + 1 }));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      setStep('input');
    }
  }, [user, usageInfo, isReady, client]);

  const handleReset = useCallback(() => {
    setResult(null);
    setInput('');
    setError(null);
    setStep('input');
  }, []);

  const handleSignOut = async () => {
    if (!client) return;
    try {
      await signOut(client);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const date = new Date().toLocaleDateString('en-CA');
      const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
      const anon = parseInt(localStorage.getItem(key) || '0');
      setUser({ isLoggedIn: false, usageCount: anon, isPro: false });
      setUsageInfo(null);
      setStep('input');
    } catch (err) {
      console.error('Sign out error:', err);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const date = new Date().toLocaleDateString('en-CA');
      const key = `anonymous_usage_${date}_${tz.replace(/\//g, '-')}`;
      const anon = parseInt(localStorage.getItem(key) || '0');
      setUser({ isLoggedIn: false, usageCount: anon, isPro: false });
      setUsageInfo(null);
      setStep('input');
    }
  };

  const handlePaymentSuccess = useCallback(async (_subscriptionId: string) => {
    if (client && user.userId) {
      const profile = await getProfile(client, user.userId);
      if (profile) {
        setUser(prev => ({ ...prev, isPro: profile.is_pro || false }));
        setUsageInfo({
          daily: profile.daily_usage ?? 0,
          monthly: profile.monthly_usage ?? 0,
          dailyLimit: 100,
          monthlyLimit: 3000,
          timezone: profile.timezone || 'UTC',
        });
      }
    }
    setStep('input');
  }, [client, user.userId]);

  if (loading || !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  const remainingDaily = usageInfo
    ? Math.max(0, usageInfo.dailyLimit - usageInfo.daily)
    : !user.isLoggedIn
    ? Math.max(0, ANONYMOUS_DAILY_LIMIT - user.usageCount)
    : null;

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen text-gray-900 font-sans bg-white">
        <nav className="fixed top-0 left-0 right-0 h-16 border-b border-gray-100 bg-white/95 backdrop-blur-sm z-40 flex items-center justify-between px-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep('input')}>
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <div className="w-4 h-0.5 bg-white rounded-full rotate-45 translate-y-[-1px]"></div>
              <div className="w-4 h-0.5 bg-white rounded-full -rotate-45 translate-y-[1px] absolute"></div>
            </div>
            <span className="font-black text-lg tracking-tight">SummAI</span>
          </div>

          <div className="flex items-center gap-8">
            {user.isPro && (
              <span className="text-[10px] font-bold bg-black text-white uppercase tracking-widest px-3 py-1 rounded-full">
                PRO
              </span>
            )}
            {remainingDaily !== null && (
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {remainingDaily} Uses Left Today
              </span>
            )}
            {user.isLoggedIn ? (
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{user.email}</span>
                <button onClick={handleSignOut} className="text-[10px] font-black uppercase tracking-widest hover:text-black">Sign Out</button>
              </div>
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-black uppercase tracking-widest hover:text-gray-500">Log In</button>
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