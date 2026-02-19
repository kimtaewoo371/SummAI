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

  // ─── 초기 인증 & 프로필 로드 ───
  useEffect(() => {
    console.log('🔍 App useEffect triggered - isReady:', isReady, 'client:', !!client);
    
    if (!isReady || !client) { 
      console.log('⏳ Waiting for Supabase... isReady:', isReady, 'client:', !!client);
      setLoading(true); 
      return; 
    }

    console.log('✅ Supabase ready, starting initialization...');
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔍 Getting session...');
        const { data: { session } } = await client.auth.getSession();
        console.log('🔍 Session result:', session ? 'User logged in' : 'No session');
        
        if (session?.user) {
          console.log('🔍 Fetching profile for user:', session.user.id);
          const profile = await getProfile(client, session.user.id);
          console.log('🔍 Profile result:', profile ? 'Loaded' : 'null');
          
          if (isMounted && profile) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.usage_count,
              email: profile.email,
              userId: session.user.id,
              isPro: profile.is_pro || false,
            });
            setUsageInfo({
              daily:        profile.daily_usage ?? 0,
              monthly:      profile.monthly_usage ?? 0,
              dailyLimit:   profile.is_pro ? 100 : 10,
              monthlyLimit: profile.is_pro ? 3000 : 200,
            });
          }
        } else {
          console.log('✅ No user session, continuing as anonymous');
        }
      } catch (err) {
        console.error('❌ Auth init error:', err);
      } finally {
        if (isMounted) {
          console.log('✅ Setting loading to FALSE');
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 Auth state changed:', event);
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        const profile = await getProfile(client, session.user.id);
        if (isMounted && profile) {
          setUser({
            isLoggedIn: true,
            usageCount: profile.usage_count,
            email: profile.email,
            userId: session.user.id,
            isPro: profile.is_pro || false,
          });
          setUsageInfo({
            daily:        profile.daily_usage ?? 0,
            monthly:      profile.monthly_usage ?? 0,
            dailyLimit:   profile.is_pro ? 100 : 10,
            monthlyLimit: profile.is_pro ? 3000 : 200,
          });
        }
      } else if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
          setUsageInfo(null);
        }
      }
    });

    return () => { 
      console.log('🔍 App useEffect cleanup');
      isMounted = false; 
      subscription.unsubscribe(); 
    };
  }, [isReady, client]);

  const handleProcess = useCallback(async (text: string) => {
    if (!isReady || !client) {
      setError('System is initializing. Please wait...');
      return;
    }

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
        setError(
          `일일 한도 초과 (${usageInfo.daily}/${usageInfo.dailyLimit}).` +
          (user.isPro ? ' 내일 초기화됩니다.' : ' Pro로 업그레이드하면 100회/일 사용 가능합니다.')
        );
        if (!user.isPro) setStep('recharge');
        return;
      }
      if (usageInfo.monthly >= usageInfo.monthlyLimit) {
        setError(
          `월간 한도 초과 (${usageInfo.monthly}/${usageInfo.monthlyLimit}).` +
          (user.isPro ? ' 다음달 초기화됩니다.' : ' Pro로 업그레이드하면 3,000회/월 사용 가능합니다.')
        );
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
            client, user.userId, text.length, data.resultText?.length || 0, 0
          );
          setUsageInfo({
            daily:        updatedProfile.daily_usage,
            monthly:      updatedProfile.monthly_usage,
            dailyLimit:   updatedProfile.is_pro ? 100 : 10,
            monthlyLimit: updatedProfile.is_pro ? 3000 : 200,
          });
          setUser(prev => ({ ...prev, usageCount: updatedProfile.daily_usage }));
        } else {
          const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
          const usage = parseInt(localStorage.getItem(todayKey) || '0');
          localStorage.setItem(todayKey, (usage + 1).toString());
          setUser(prev => ({ ...prev, usageCount: prev.usageCount + 1 }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';

      if (message.includes('DAILY_LIMIT_EXCEEDED')) {
        setError(user.isPro ? '일일 한도 초과. 내일 초기화됩니다.' : '일일 한도 초과. Pro로 업그레이드하세요.');
        if (!user.isPro) setStep('recharge');
      } else if (message.includes('MONTHLY_LIMIT_EXCEEDED')) {
        setError(user.isPro ? '월간 한도 초과. 다음달 초기화됩니다.' : '월간 한도 초과. Pro로 업그레이드하세요.');
        if (!user.isPro) setStep('recharge');
      } else {
        setError(message);
        setStep('input');
      }
    }
  }, [user, usageInfo, isReady, client]);

  const handleReset = useCallback(() => {
    setResult(null); setInput(''); setError(null); setStep('input');
  }, []);

  const handleSignOut = async () => {
    if (!client) return;
    try { await signOut(client); setStep('input'); }
    catch (err) { console.error('Sign out error:', err); }
  };

  const handlePaymentSuccess = useCallback(async (_subscriptionId: string) => {
    if (client && user.userId) {
      const profile = await getProfile(client, user.userId);
      if (profile) {
        setUser(prev => ({ ...prev, isPro: profile.is_pro || false }));
        setUsageInfo({
          daily:        profile.daily_usage ?? 0,
          monthly:      profile.monthly_usage ?? 0,
          dailyLimit:   100,
          monthlyLimit: 3000,
        });
      }
    }
    setStep('input');
  }, [client, user.userId]);

  console.log('🔍 App render - loading:', loading, 'isReady:', isReady);

  if (loading || !isReady) {
    console.log('🔍 Showing loading spinner - loading:', loading, 'isReady:', isReady);
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  console.log('✅ App ready, rendering main UI');

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