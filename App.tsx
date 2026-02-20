// App.tsx - 기존 코드에 세션 관리 기능만 추가
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
const INIT_TIMEOUT = 10000; // 10초

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

  // ⭐ 추가: 세션 관리를 위한 ref와 state
  const sessionRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTime = useRef<number>(Date.now());
  const initAttempts = useRef<number>(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  /* ⭐ 추가: 세션 갱신 함수 */
  const refreshSession = useCallback(async () => {
    if (!client) return false;
    
    try {
      const { data: { session }, error } = await client.auth.refreshSession();
      
      if (error) {
        console.warn('Session refresh failed:', error);
        if (error.message?.includes('refresh_token')) {
          await signOut(client);
          setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
          setUsageInfo(null);
        }
        return false;
      }
      
      if (session?.user) {
        console.log('Session refreshed successfully');
        return true;
      }
    } catch (err) {
      console.error('Session refresh error:', err);
      return false;
    }
    
    return false;
  }, [client]);

  /* ⭐ 추가: 연결 복구 함수 */
  const handleConnectionRecovery = useCallback(async () => {
    if (isReconnecting) return;
    
    setIsReconnecting(true);
    console.log('Attempting to recover connection...');

    try {
      if (client && user.isLoggedIn) {
        const success = await refreshSession();
        
        if (success) {
          const { data: { session } } = await client.auth.getSession();
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
              setUsageInfo({
                daily: profile.daily_usage ?? 0,
                monthly: profile.monthly_usage ?? 0,
                dailyLimit: profile.is_pro ? 100 : 10,
                monthlyLimit: profile.is_pro ? 3000 : 200,
              });
              console.log('Connection recovered successfully');
            }
          }
        } else {
          console.warn('Session recovery failed');
          setTimeout(() => {
            if (window.confirm('Connection lost. Would you like to refresh the page?')) {
              window.location.reload();
            }
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Connection recovery error:', err);
    } finally {
      setIsReconnecting(false);
    }
  }, [client, user.isLoggedIn, refreshSession, isReconnecting]);

  /* ⭐ 추가: 주기적 세션 체크 */
  useEffect(() => {
    if (!client || !user.isLoggedIn) return;

    refreshSession();

    sessionRefreshTimer.current = setInterval(() => {
      refreshSession();
    }, SESSION_REFRESH_INTERVAL);

    return () => {
      if (sessionRefreshTimer.current) {
        clearInterval(sessionRefreshTimer.current);
      }
    };
  }, [client, user.isLoggedIn, refreshSession]);

  /* ⭐ 추가: 탭 활성화 감지 */
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        const inactiveTime = Date.now() - lastActivityTime.current;
        
        if (inactiveTime > SESSION_REFRESH_INTERVAL) {
          console.log('Tab reactivated - starting connection recovery');
          await handleConnectionRecovery();
        }
        
        lastActivityTime.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleConnectionRecovery]);

  /* ⭐ 추가: 온라인/오프라인 감지 */
  useEffect(() => {
    const handleOnline = async () => {
      console.log('Network reconnected');
      await handleConnectionRecovery();
    };

    const handleOffline = () => {
      console.log('Network disconnected');
      setError('Internet connection lost');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleConnectionRecovery]);

  /* ---------------- AUTH INIT (⭐ 타임아웃만 추가) ---------------- */

  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;
    let initTimer: NodeJS.Timeout | null = null; // ⭐ 추가

    const initAuth = async () => {
      if (!client) return;

      // ⭐ 추가: 초기화 타임아웃
      initTimer = setTimeout(() => {
        if (isMounted && loading) {
          initAttempts.current++;
          
          if (initAttempts.current >= 3) {
            setInitError('Initialization timeout');
            setLoading(false);
            setAppReady(true);
          } else {
            console.log(`Retrying initialization (${initAttempts.current}/3)...`);
            window.location.reload();
          }
        }
      }, INIT_TIMEOUT);

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
        if (isMounted) setInitError('Initialization failed'); // ⭐ 추가
      } finally {
        if (initTimer) clearTimeout(initTimer); // ⭐ 추가
        
        if (isMounted) {
          setLoading(false);
          setAppReady(true);
          initAttempts.current = 0; // ⭐ 추가
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

        // ⭐ 추가: 토큰 갱신 로그
        if (event === "TOKEN_REFRESHED") {
          console.log('Token auto-refreshed');
        }
      });

      authSubscription = data.subscription;
    };

    if (isReady && client) initAuth();

    return () => {
      isMounted = false;
      if (authSubscription) authSubscription.unsubscribe();
      if (initTimer) clearTimeout(initTimer); // ⭐ 추가
    };
  }, [client, isReady]);

  /* ⭐⭐⭐ Supabase 준비 대기 (⭐ 타임아웃만 추가) ⭐⭐⭐ */
  const waitForClient = async (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Supabase client timeout'));
      }, 5000);
      
      const check = () => {
        if (client) {
          clearTimeout(timeout);
          resolve(client);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  };

  /* ---------------- ANALYZE (⭐ 세션 검증만 추가) ---------------- */

  const handleProcess = useCallback(async (text: string) => {
    setError(null);
    setResult(null);

    try {
      // ⭐⭐⭐ 핵심: Supabase 준비될때까지 기다림
      const supabase = await waitForClient();

      // ⭐ 추가: 로그인된 사용자 세션 검증
      if (user.isLoggedIn) {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          console.warn('Session expired - re-login required');
          setError('Your session has expired. Please log in again.');
          await signOut(supabase);
          setStep('login');
          return;
        }
        
        // 세션이 곧 만료될 예정이면 갱신
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt && (expiresAt - now) < 300) {
          console.log('Session about to expire - refreshing...');
          await refreshSession();
        }
      }

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
      
      // ⭐ 추가: 네트워크 에러 처리
      if (err.message?.includes('Failed to fetch') || err.message?.includes('network')) {
        setError('Please check your network connection');
      } else if (err.message?.includes('timeout')) {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message || "Analysis failed");
      }
      
      setStep("input");
    }

  }, [user, client, refreshSession]);

  /* ---------------- OTHER HANDLERS (⭐ 로그아웃만 수정) ---------------- */

  const handleReset = () => {
    // 완전 새로고침
    window.location.reload();
  };

  const handleSignOut = async () => {
    if (!client) {
      // ⭐ 추가: 클라이언트 없으면 강제 로그아웃
      setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
      setUsageInfo(null);
      setStep("input");
      return;
    }
    
    try {
      await signOut(client);
      setStep("input");
    } catch (err) {
      console.error('Sign out error:', err);
      // ⭐ 추가: 에러나도 강제 로그아웃
      setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
      setUsageInfo(null);
      setStep("input");
    }
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

  /* ---------------- RENDER (⭐ 초기화 에러 화면만 추가) ---------------- */

  if (!isReady || !client || !appReady || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin mb-4"></div>
        {loading && (
          <p className="text-xs text-gray-400 animate-pulse">
            Preparing connection...
          </p>
        )}
      </div>
    );
  }

  // ⭐ 추가: 초기화 에러 화면
  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-8">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold mb-2">{initError}</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Please refresh the page or try again later
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-black text-white text-sm font-bold rounded-lg hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div className="min-h-screen text-gray-900 font-sans bg-white">

        {/* ⭐ 추가: 재연결 중 표시 */}
        {isReconnecting && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-6 py-2 rounded-full z-50 text-[10px] font-bold flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Reconnecting...
          </div>
        )}

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