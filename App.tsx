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
  checkUsageLimit,
  incrementUsageCount,
  signOut
} from './services/supabaseClient';
import { updateUserTimezone, formatTimeUntilMidnight } from './utils/timezone';

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
    timezone?: string;
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
      // 🔥 타임아웃 추가
      const refreshPromise = client.auth.refreshSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session refresh timeout')), 5000)
      );
      
      const { data: { session }, error } = await Promise.race([
        refreshPromise,
        timeoutPromise
      ]) as any;
      
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
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        console.log('🔍 Fetching session...');
        
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        
        if (sessionError) {
          console.warn('⚠️ Session error:', sessionError);
          throw sessionError;
        }
        
        if (session?.user && isMounted) {
          console.log('🔍 Session found, loading profile...');
          
          // ✨ 타임존 자동 설정 (백그라운드에서 실행)
          updateUserTimezone(client, session.user.id)
            .then(result => {
              if (result.success) {
                console.log(`✅ 타임존 자동 설정: ${result.timezone}`);
              }
            })
            .catch(err => {
              console.warn('⚠️ 타임존 설정 실패:', err);
            });
          
          // 프로필 로드
          const profile = await getProfile(client, session.user.id);
          
          if (isMounted) {
            if (profile) {
              console.log('✅ Auth initialized with profile');
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
            } else {
              console.warn('⚠️ Profile not found, signing out...');
              await client.auth.signOut();
              setUser({ isLoggedIn: false, usageCount: 0, isPro: false });
              setUsageInfo(null);
            }
          }
        } else {
          console.log('✅ No session, continuing as Guest');
          // 🔥 비로그인 사용자: localStorage에서 오늘의 사용량 불러오기
          if (isMounted) {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const localDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
            const todayKey = `anonymous_usage_${localDate}_${timezone.replace(/\//g, '-')}`;
            const anonymousUsage = parseInt(localStorage.getItem(todayKey) || '0');
            console.log(`📊 Anonymous usage today: ${anonymousUsage}/${ANONYMOUS_DAILY_LIMIT}`);
            setUser({ 
              isLoggedIn: false, 
              usageCount: anonymousUsage, 
              isPro: false 
            });
          }
        }
      } catch (err) {
        console.error('❌ Initialization failed:', err);
        // 🔥 에러 발생시 강제 게스트 모드
        if (isMounted) {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const localDate = new Date().toLocaleDateString('en-CA');
          const todayKey = `anonymous_usage_${localDate}_${timezone.replace(/\//g, '-')}`;
          const anonymousUsage = parseInt(localStorage.getItem(todayKey) || '0');
          setUser({ 
            isLoggedIn: false, 
            usageCount: anonymousUsage, 
            isPro: false 
          });
          setUsageInfo(null);
        }
      } finally {
        // 🔥 반드시 로딩 종료
        if (isMounted) {
          console.log('✅ Initialization complete, loading=false');
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // 🔥 Auth 상태 변경 리스너
    const setupAuthListener = async () => {
      const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
        console.log('🔍 Auth State Change:', event);
        
        if (!isMounted) return;

        // 🚀 [핵심 수정] SIGNED_IN 이벤트를 무시하지 않고 프로필을 로드함
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          console.log('🔍 User signed in or updated, fetching profile...');
          const profile = await getProfile(client, session.user.id);
          
          if (isMounted && profile) {
            console.log('✅ Profile sync successful on event:', event);
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
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            console.log('🔍 Signed out, restoring anonymous usage');
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const localDate = new Date().toLocaleDateString('en-CA');
            const todayKey = `anonymous_usage_${localDate}_${timezone.replace(/\//g, '-')}`;
            const anonymousUsage = parseInt(localStorage.getItem(todayKey) || '0');
            setUser({ isLoggedIn: false, usageCount: anonymousUsage, isPro: false });
            setUsageInfo(null);
          }
        }
      });
      
      authSubscription = subscription;
    };

    setupAuthListener();

    return () => { 
      isMounted = false; 
      if (authSubscription) {
        authSubscription.unsubscribe(); 
      }
    };
  }, [isReady, client]);

  // ⭐ 추가: 주기적 세션 체크 (로그인 상태일 때만)
  useEffect(() => {
    if (!client || !user.isLoggedIn) return;

    // 5분마다 세션 갱신
    sessionRefreshTimer.current = setInterval(() => {
      console.log('⏰ Running periodic session refresh');
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
          console.log('Tab reactivated - refreshing session due to inactivity');
          const success = await refreshSession();
          
          if (!success) {
            // 세션 갱신 실패시 재로그인 유도
            console.error('Session refresh failed after inactivity');
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

    if (!text.trim()) {
      setError('Please enter some text to analyze');
      return;
    }

    console.log('🚀 Starting analysis process...');
    setError(null);
    setResult(null);

    // 비로그인 사용자 로컬 스토리지 기반 제한
    if (!user.isLoggedIn) {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localDate = new Date().toLocaleDateString('en-CA');
      const todayKey = `anonymous_usage_${localDate}_${timezone.replace(/\//g, '-')}`;
      const usage = parseInt(localStorage.getItem(todayKey) || '0');
      if (usage >= ANONYMOUS_DAILY_LIMIT) {
        console.warn('⚠️ Anonymous daily limit reached');
        setStep('recharge');
        return;
      }
    }

    // 로그인 사용자 DB 기반 제한
    if (user.isLoggedIn && user.userId) {
      try {
        console.log('📊 Checking usage limit for user:', user.userId);
        const limitCheck = await checkUsageLimit(client, user.userId);
        
        if (!limitCheck.allowed) {
          console.warn('⚠️ Usage limit reached:', limitCheck.reason);
          const reason = limitCheck.reason || 'Unknown error';
          const message = limitCheck.message || `${reason}: ${limitCheck.daily_usage || 0}/${limitCheck.daily_limit || 0}`;
          setError(message);
          
          if (!user.isPro) {
            setStep('recharge');
          }
          return;
        }
        
        if (limitCheck.will_reset) {
          console.log('🔄 Usage reset detected in check_usage_limit');
          setUsageInfo({
            daily: 0,
            monthly: limitCheck.monthly_usage || 0,
            dailyLimit: limitCheck.daily_limit || 10,
            monthlyLimit: limitCheck.monthly_limit || 200,
            timezone: limitCheck.user_timezone || 'UTC',
          });
        }
      } catch (err) {
        console.error('❌ Usage limit check failed:', err);
        setError('Failed to check usage limit. Please try again.');
        return;
      }
    }

    setInput(text);
    setStep('processing');

    try {
      console.log('🧠 Calling analyzeText service...');
      const data = await analyzeText(client, text);

      if (data) {
        console.log('✅ Analysis complete');
        setResult(data);
        setStep('result');

        if (user.isLoggedIn && user.userId) {
          console.log('📈 Incrementing usage count in DB...');
          const updatedProfile = await incrementUsageCount(
            client, user.userId, text.length, data.resultText?.length || 0, 0
          );
          
          setUsageInfo({
            daily: updatedProfile.daily_usage,
            monthly: updatedProfile.monthly_usage,
            dailyLimit: updatedProfile.is_pro ? 100 : 10,
            monthlyLimit: updatedProfile.is_pro ? 3000 : 200,
            timezone: updatedProfile.timezone || 'UTC',
          });
          setUser(prev => ({ ...prev, usageCount: updatedProfile.daily_usage }));
        } else {
          // 비로그인 사용자: localStorage 업데이트
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const localDate = new Date().toLocaleDateString('en-CA');
          const todayKey = `anonymous_usage_${localDate}_${timezone.replace(/\//g, '-')}`;
          const usage = parseInt(localStorage.getItem(todayKey) || '0');
          localStorage.setItem(todayKey, (usage + 1).toString());
          setUser(prev => ({ ...prev, usageCount: prev.usageCount + 1 }));
          console.log('📈 Anonymous usage incremented in localStorage');
        }
      }
    } catch (err) {
      console.error('❌ Process error:', err);
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      setStep('input');
    }
  }, [user, isReady, client]);

  const handleReset = useCallback(() => {
    console.log('🔄 Resetting app state to input');
    setResult(null); setInput(''); setError(null); setStep('input');
  }, []);

  const handleSignOut = async () => {
    if (!client) return;
    try { 
      console.log('🚪 Signing out...');
      await signOut(client); 
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localDate = new Date().toLocaleDateString('en-CA');
      const todayKey = `anonymous_usage_${localDate}_${timezone.replace(/\//g, '-')}`;
      const anonymousUsage = parseInt(localStorage.getItem(todayKey) || '0');
      
      setUser({ isLoggedIn: false, usageCount: anonymousUsage, isPro: false });
      setUsageInfo(null);
      setStep('input'); 
    }
    catch (err) { 
      console.error('Sign out error:', err);
      setStep('input');
    }
  };

  const handlePaymentSuccess = useCallback(async (_subscriptionId: string) => {
    console.log('💰 Payment success callback triggered');
    if (client && user.userId) {
      const profile = await getProfile(client, user.userId);
      if (profile) {
        setUser(prev => ({ ...prev, isPro: profile.is_pro || false }));
        setUsageInfo({
          daily: profile.daily_usage ?? 0,
          monthly: profile.monthly_usage ?? 0,
          dailyLimit: profile.is_pro ? 100 : 10,
          monthlyLimit: profile.is_pro ? 3000 : 200,
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

  // ─── 렌더링 영역 ───
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