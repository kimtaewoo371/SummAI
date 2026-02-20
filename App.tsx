import React, { useState, useCallback, useEffect, useRef } from 'react';
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
const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5분

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

  // ⭐ 추가: 세션 관리용
  const sessionRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTime = useRef<number>(Date.now());

  // ⭐ 추가: 세션 갱신 함수
  const refreshSession = useCallback(async () => {
    if (!client) return false;
    
    try {
      const { data: { session }, error } = await client.auth.refreshSession();
      
      if (error) {
        console.warn('Session refresh failed:', error);
        return false;
      }
      
      if (session?.user) {
        console.log('Session refreshed successfully');
        return true;
      }
    } catch (err) {
      console.error('Session refresh error:', err);
    }
    return false;
  }, [client]);

  // ─── 초기 인증 & 프로필 로드 ───
  useEffect(() => {
    console.log('🔍 App useEffect - isReady:', isReady, 'client:', !!client);
    
    if (!isReady || !client) { 
      return; 
    }

    let isMounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔍 Fetching session...');
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        
        if (sessionError) throw sessionError;
        
        if (session?.user && isMounted) {
          console.log('🔍 Session found, loading profile...');
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
              daily: profile.daily_usage ?? 0,
              monthly: profile.monthly_usage ?? 0,
              dailyLimit: profile.is_pro ? 100 : 10,
              monthlyLimit: profile.is_pro ? 3000 : 200,
            });
          }
        } else {
          console.log('✅ No session, continuing as Guest');
        }
      } catch (err) {
        console.error('❌ Initialization failed:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 Auth State Change:', event);
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
            daily: profile.daily_usage ?? 0,
            monthly: profile.monthly_usage ?? 0,
            dailyLimit: profile.is_pro ? 100 : 10,
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
      isMounted = false; 
      subscription.unsubscribe(); 
    };
  }, [isReady, client]);

  // ⭐ 추가: 주기적 세션 체크 (로그인 상태일 때만)
  useEffect(() => {
    if (!client || !user.isLoggedIn) return;

    // 5분마다 세션 갱신
    sessionRefreshTimer.current = setInterval(() => {
      refreshSession();
    }, SESSION_REFRESH_INTERVAL);

    return () => {
      if (sessionRefreshTimer.current) {
        clearInterval(sessionRefreshTimer.current);
      }
    };
  }, [client, user.isLoggedIn, refreshSession]);

  // ⭐ 추가: 탭 재활성화시 세션 복구
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden && client && user.isLoggedIn) {
        const inactiveTime = Date.now() - lastActivityTime.current;
        
        // 5분 이상 비활성화되었으면 세션 갱신
        if (inactiveTime > SESSION_REFRESH_INTERVAL) {
          console.log('Tab reactivated - refreshing session');
          const success = await refreshSession();
          
          if (!success) {
            // 세션 갱신 실패시 재로그인 유도
            setError('Your session has expired. Please log in again.');
            await signOut(client);
            setStep('login');
          }
        }
        
        lastActivityTime.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [client, user.isLoggedIn, refreshSession]);

  const handleProcess = useCallback(async (text: string) => {
    if (!isReady || !client) {
      setError('System is initializing. Please wait...');
      return;
    }

    setError(null);
    setResult(null);

    // ⭐ 추가: 로그인 사용자는 분석 전 세션 체크
    if (user.isLoggedIn && user.userId) {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      
      if (sessionError || !session) {
        setError('Your session has expired. Please log in again.');
        await signOut(client);
        setStep('login');
        return;
      }
    }

    // 비로그인 사용자 로컬 스토리지 기반 제한
    if (!user.isLoggedIn) {
      const todayKey = `anonymous_usage_${new Date().toISOString().slice(0, 10)}`;
      const usage = parseInt(localStorage.getItem(todayKey) || '0');
      if (usage >= ANONYMOUS_DAILY_LIMIT) {
        setStep('recharge');
        return;
      }
    }

    // 로그인 사용자 DB 기반 제한
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
            client, user.userId, text.length, data.resultText?.length || 0, 0
          );
          setUsageInfo({
            daily: updatedProfile.daily_usage,
            monthly: updatedProfile.monthly_usage,
            dailyLimit: updatedProfile.is_pro ? 100 : 10,
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
      setError(message);
      setStep('input');
    }
  }, [user, usageInfo, isReady, client, refreshSession]);

  const handleReset = useCallback(() => {
    setResult(null); setInput(''); setError(null); setStep('input');
  }, []);

  const handleSignOut = async () => {
    if (!client) return;
    try { 
      await signOut(client); 
      setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
      setUsageInfo(null);
      setStep('input'); 
    }
    catch (err) { 
      console.error('Sign out error:', err);
      // ⭐ 추가: 에러나도 강제 로그아웃
      setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
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